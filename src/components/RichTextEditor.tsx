import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Image from '@tiptap/extension-image';
import Youtube from '@tiptap/extension-youtube';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, Eraser, Subscript as SubscriptIcon, Superscript as SuperscriptIcon, Image as ImageIcon, Video, DivideSquare } from 'lucide-react';
import { useEffect } from 'react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export const RichTextEditor = ({ value, onChange, placeholder, className = '', minHeight = 'min-h-[80px]' }: RichTextEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Subscript,
      Superscript,
      Image.configure({
        inline: true,
        allowBase64: true,
      }),
      Youtube.configure({
        inline: false,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none p-3 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 ${minHeight}`,
      },
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  if (!editor) {
    return null;
  }

  const addImage = () => {
    const url = window.prompt('Nhập đường dẫn hình ảnh (URL):');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const addYoutubeVideo = () => {
    const url = window.prompt('Nhập đường dẫn video Youtube (URL):');
    if (url) {
      editor.chain().focus().setYoutubeVideo({ src: url }).run();
    }
  };

  const addFraction = () => {
    const numerator = window.prompt('Nhập tử số:');
    if (numerator === null) return;
    const denominator = window.prompt('Nhập mẫu số:');
    if (denominator === null) return;
    
    // Insert a simple fraction using HTML
    const fractionHtml = `<span style="display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; font-size: 0.8em; line-height: 1; margin: 0 0.2em;"><span style="border-bottom: 1px solid currentColor; padding: 0 0.1em;">${numerator}</span><span style="padding: 0 0.1em;">${denominator}</span></span>`;
    editor.chain().focus().insertContent(fractionHtml).run();
  };

  return (
    <div className={`border border-slate-300 rounded-lg overflow-hidden flex flex-col focus-within:ring-2 focus-within:ring-teal-500 bg-white ${className}`}>
      <div className="bg-slate-50 border-b border-slate-200 p-1 flex items-center gap-1 flex-wrap">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-1.5 rounded w-8 h-8 flex items-center justify-center transition-colors ${
            editor.isActive('bold') ? 'bg-teal-100 text-teal-700' : 'text-slate-600 hover:bg-slate-200'
          }`}
          title="In đậm"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-1.5 rounded w-8 h-8 flex items-center justify-center transition-colors ${
            editor.isActive('italic') ? 'bg-teal-100 text-teal-700' : 'text-slate-600 hover:bg-slate-200'
          }`}
          title="In nghiêng"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`p-1.5 rounded w-8 h-8 flex items-center justify-center transition-colors ${
            editor.isActive('underline') ? 'bg-teal-100 text-teal-700' : 'text-slate-600 hover:bg-slate-200'
          }`}
          title="Gạch chân"
        >
          <UnderlineIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`p-1.5 rounded w-8 h-8 flex items-center justify-center transition-colors ${
            editor.isActive('strike') ? 'bg-teal-100 text-teal-700' : 'text-slate-600 hover:bg-slate-200'
          }`}
          title="Gạch ngang"
        >
          <Strikethrough className="w-4 h-4" />
        </button>
        
        <div className="w-px h-5 bg-slate-300 mx-1"></div>
        
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleSubscript().run()}
          className={`p-1.5 rounded w-8 h-8 flex items-center justify-center transition-colors ${
            editor.isActive('subscript') ? 'bg-teal-100 text-teal-700' : 'text-slate-600 hover:bg-slate-200'
          }`}
          title="Chỉ số dưới (Subscript)"
        >
          <SubscriptIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
          className={`p-1.5 rounded w-8 h-8 flex items-center justify-center transition-colors ${
            editor.isActive('superscript') ? 'bg-teal-100 text-teal-700' : 'text-slate-600 hover:bg-slate-200'
          }`}
          title="Số mũ (Superscript)"
        >
          <SuperscriptIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={addFraction}
          className="p-1.5 text-slate-600 hover:bg-slate-200 rounded w-8 h-8 flex items-center justify-center transition-colors"
          title="Chèn phân số"
        >
          <DivideSquare className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-300 mx-1"></div>

        <button
          type="button"
          onClick={addImage}
          className="p-1.5 text-slate-600 hover:bg-slate-200 rounded w-8 h-8 flex items-center justify-center transition-colors"
          title="Chèn hình ảnh"
        >
          <ImageIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={addYoutubeVideo}
          className="p-1.5 text-slate-600 hover:bg-slate-200 rounded w-8 h-8 flex items-center justify-center transition-colors"
          title="Chèn video Youtube"
        >
          <Video className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-slate-300 mx-1"></div>

        <button
          type="button"
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          className="p-1.5 text-slate-600 hover:bg-slate-200 rounded w-8 h-8 flex items-center justify-center transition-colors"
          title="Xóa định dạng"
        >
          <Eraser className="w-4 h-4" />
        </button>
      </div>
      <EditorContent editor={editor} className="flex-1 overflow-auto" />
    </div>
  );
};
