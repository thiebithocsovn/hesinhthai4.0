import React, { useEffect, useRef } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from '@tiptap/react';

const MAX_FRACTION_PART_LENGTH = 180;

function PlickerFractionNodeView({
  editor,
  getPos,
  node,
  selected,
  updateAttributes,
}: ReactNodeViewProps) {
  const numeratorRef = useRef<HTMLInputElement>(null);
  const denominatorRef = useRef<HTMLInputElement>(null);
  const numerator = String(node.attrs.numerator || '');
  const denominator = String(node.attrs.denominator || '');
  const width = Math.max(2.5, Math.min(16, Math.max(numerator.length, denominator.length) * 0.68 + 1));

  useEffect(() => {
    if (numerator || denominator) return;
    const frame = window.requestAnimationFrame(() => numeratorRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const continueAfterFraction = () => {
    const position = getPos();
    if (typeof position === 'number') {
      editor.chain().focus().setTextSelection(position + node.nodeSize).run();
    }
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    part: 'numerator' | 'denominator',
  ) => {
    event.stopPropagation();

    if (part === 'numerator' && (event.key === 'ArrowDown' || event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey))) {
      event.preventDefault();
      denominatorRef.current?.focus();
      denominatorRef.current?.select();
      return;
    }

    if (part === 'denominator' && (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey))) {
      event.preventDefault();
      numeratorRef.current?.focus();
      numeratorRef.current?.select();
      return;
    }

    if (part === 'denominator' && (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey))) {
      event.preventDefault();
      continueAfterFraction();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      continueAfterFraction();
    }
  };

  return (
    <NodeViewWrapper
      as="span"
      data-plicker-fraction-editor="true"
      contentEditable={false}
      className={`mx-[0.16em] inline-flex flex-col items-stretch align-middle text-[0.76em] leading-[1.15] ${
        selected ? 'rounded-sm ring-2 ring-indigo-300' : ''
      }`}
      onMouseDown={(event: React.MouseEvent<HTMLSpanElement>) => event.stopPropagation()}
    >
      <input
        ref={numeratorRef}
        aria-label="Tử số"
        autoComplete="off"
        spellCheck={false}
        value={numerator}
        maxLength={MAX_FRACTION_PART_LENGTH}
        placeholder="□"
        style={{ width: `${width}em` }}
        onChange={event => updateAttributes({ numerator: event.target.value.slice(0, MAX_FRACTION_PART_LENGTH) })}
        onKeyDown={event => handleKeyDown(event, 'numerator')}
        className="m-0 block min-w-[2.5em] rounded-none border-0 border-b-[2px] border-current bg-indigo-50/80 px-[0.26em] pb-[0.12em] pt-[0.16em] text-center font-[inherit] text-[1em] leading-[1.15] text-current outline-none placeholder:text-indigo-300 focus:bg-indigo-100"
      />
      <input
        ref={denominatorRef}
        aria-label="Mẫu số"
        autoComplete="off"
        spellCheck={false}
        value={denominator}
        maxLength={MAX_FRACTION_PART_LENGTH}
        placeholder="□"
        style={{ width: `${width}em` }}
        onChange={event => updateAttributes({ denominator: event.target.value.slice(0, MAX_FRACTION_PART_LENGTH) })}
        onKeyDown={event => handleKeyDown(event, 'denominator')}
        className="m-0 block min-w-[2.5em] rounded-none border-0 bg-indigo-50/80 px-[0.26em] pb-[0.16em] pt-[0.12em] text-center font-[inherit] text-[1em] leading-[1.15] text-current outline-none placeholder:text-indigo-300 focus:bg-indigo-100"
      />
    </NodeViewWrapper>
  );
}

export const PlickerFractionExtension = Node.create({
  name: 'plickerFraction',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      numerator: {
        default: '',
        parseHTML: element => element.getAttribute('data-numerator') || '',
        renderHTML: attributes => ({ 'data-numerator': String(attributes.numerator || '') }),
      },
      denominator: {
        default: '',
        parseHTML: element => element.getAttribute('data-denominator') || '',
        renderHTML: attributes => ({ 'data-denominator': String(attributes.denominator || '') }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-plicker-fraction="true"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const numerator = String(HTMLAttributes['data-numerator'] || '');
    const denominator = String(HTMLAttributes['data-denominator'] || '');
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-plicker-fraction': 'true' }),
      ['span', { 'data-fraction-part': 'numerator' }, numerator || '□'],
      ['span', { 'data-fraction-part': 'denominator' }, denominator || '□'],
    ];
  },

  renderText({ node }) {
    const numerator = String(node.attrs.numerator || '□');
    const denominator = String(node.attrs.denominator || '□');
    return `\\frac{${numerator}}{${denominator}}`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(PlickerFractionNodeView, {
      as: 'span',
      stopEvent: ({ event }) => event.target instanceof HTMLInputElement,
    });
  },
});
