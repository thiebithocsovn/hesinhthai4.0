import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite';
const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || 'https://trungtuyen.github.io,http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    res.status(403).json({ error: 'Nguồn truy cập chưa được cho phép.' });
    return;
  }

  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(origin ? 204 : 403);
    return;
  }

  next();
});

app.use(express.json({ limit: '50mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    aiProvider: 'google-gemini',
    model: GEMINI_MODEL,
  });
});

// Helper for Gemini API
async function callGemini(model: string, contents: any[], systemInstruction?: string, responseSchema?: any) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  
  const body: any = { 
    contents,
    generation_config: {}
  };

  if (systemInstruction) {
    body.system_instruction = { parts: [{ text: systemInstruction }] };
  }

  if (responseSchema) {
    body.generation_config.response_mime_type = "application/json";
    body.generation_config.response_schema = responseSchema;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Gemini API error details:", JSON.stringify(errorData, null, 2));
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Chat API
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history, systemInstruction } = req.body;
    
    const contents = [
      ...(history || []).map((m: any) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      })),
      { role: 'user', parts: [{ text: message }] }
    ];

    const result = await callGemini(GEMINI_MODEL, contents, systemInstruction);
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "Không có phản hồi từ AI";
    
    res.json({ text });
  } catch (error: any) {
    console.error("Chat API error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Scan API (OMR)
app.post("/api/scan", async (req, res) => {
  try {
    const { image, prompt } = req.body;
    
    const contents = [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: "image/jpeg", data: image } }
      ]
    }];

    const responseSchema = {
      type: "object",
      properties: {
        sbd: { type: "string" },
        maDe: { type: "string" },
        part1: { 
          type: "object",
          properties: {
            "1": { type: "string" },
            "2": { type: "string" }
          },
          description: "Results for Part 1 (Questions 1-40)"
        },
        part2: { 
          type: "object",
          properties: {
            "1": { type: "object", properties: { "a": { type: "string" } } }
          },
          description: "Results for Part 2 (Questions 1-8)"
        },
        part3: { 
          type: "object", 
          properties: {
            "1": { type: "string" }
          },
          description: "Results for Part 3 (Questions 1-6)"
        }
      },
      required: ["sbd", "maDe", "part1"]
    };

    const result = await callGemini(GEMINI_MODEL, contents, undefined, responseSchema);
    let text = result.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    
    res.json(JSON.parse(text));
  } catch (error: any) {
    console.error("Scan API error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Generate Questions API (HeadShakeGame)
app.post("/api/generate-questions", async (req, res) => {
  try {
    const { topic, count } = req.body;
    
    const prompt = `Hãy tạo ${count || 5} câu hỏi trắc nghiệm về chủ đề "${topic}". 
    Mỗi câu trả lời chỉ có 2 lựa chọn (Trái và Phải).`;

    const contents = [{
      parts: [{ text: prompt }]
    }];

    const responseSchema = {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          leftAnswer: { type: "string" },
          rightAnswer: { type: "string" },
          correctAnswer: { type: "string", enum: ["left", "right"] },
          points: { type: "number" }
        },
        required: ["text", "leftAnswer", "rightAnswer", "correctAnswer", "points"]
      }
    };

    const result = await callGemini(GEMINI_MODEL, contents, "Bạn là một giáo viên chuyên soạn đề thi trắc nghiệm.", responseSchema);
    let text = result.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    
    res.json(JSON.parse(text));
  } catch (error: any) {
    console.error("Generate Questions error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Scan Plicker API
app.post("/api/scan-plicker", async (req, res) => {
  try {
    const { image } = req.body;
    
    const prompt = `Đây là ảnh chụp từ camera lớp học. Trong ảnh có các học sinh đang giơ thẻ Plicker.
    Thẻ Plicker là một hình vuông màu đen với họa tiết trắng bên trong (giống mã QR đơn giản).
    Ở các cạnh của thẻ có các chữ cái A, B, C, D (rất nhỏ). Đáp án được chọn là chữ cái nằm ở phía TRÊN CÙNG theo hướng giơ thẻ của học sinh. 
    Ở các góc của thẻ có thể có số ID của thẻ (ví dụ: #1, #2...).

    Nhiệm vụ của bạn:
    1. Phát hiện tất cả các thẻ Plicker có trong ảnh.
    2. Với mỗi thẻ, hãy xác định số ID (cardId) và chữ cái ở phía TRÊN CÙNG (answer).
    3. Nếu không thấy số ID, hãy cố gắng đoán dựa trên thứ tự hoặc ngữ cảnh nếu có thể, hoặc bỏ qua nếu không chắc chắn.
    4. Trả về kết quả dưới dạng JSON.`;

    const contents = [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: "image/jpeg", data: image } }
      ]
    }];
    const responseSchema = {
      type: "object",
      properties: {
        detections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              cardId: { type: "number" },
              answer: { type: "string", enum: ["A", "B", "C", "D"] }
            },
            required: ["cardId", "answer"]
          }
        }
      },
      required: ["detections"]
    };

    const result = await callGemini(GEMINI_MODEL, contents, "Bạn là một chuyên gia nhận diện thẻ Plicker.", responseSchema);
    let text = result.candidates?.[0]?.content?.parts?.[0]?.text || '{"detections": []}';
    
    // Sometimes Gemini wraps JSON in markdown blocks even with responseMimeType
    if (text.includes("```json")) {
      text = text.split("```json")[1].split("```")[0].trim();
    } else if (text.includes("```")) {
      text = text.split("```")[1].split("```")[0].trim();
    }
    
    try {
      res.json(JSON.parse(text));
    } catch (parseError) {
      console.error("JSON parse error from Gemini:", text);
      res.json({ detections: [] });
    }
  } catch (error: any) {
    console.error("Scan Plicker error:", error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
