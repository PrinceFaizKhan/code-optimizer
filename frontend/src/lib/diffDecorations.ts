import { RangeSetBuilder, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

/** Tints whole lines. `lines` must be 1-based and ascending. */
export function diffLineDecorations(lines: number[], className: string): Extension {
  const lineDecoration = Decoration.line({ class: className });

  return StateField.define<DecorationSet>({
    create(state) {
      const builder = new RangeSetBuilder<Decoration>();
      for (const lineNumber of lines) {
        if (lineNumber < 1 || lineNumber > state.doc.lines) continue;
        const position = state.doc.line(lineNumber).from;
        builder.add(position, position, lineDecoration);
      }
      return builder.finish();
    },
    update(value) {
      return value;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
