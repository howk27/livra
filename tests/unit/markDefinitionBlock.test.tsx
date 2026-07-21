import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { MarkDefinitionBlock } from '../../components/mark/MarkDefinitionBlock';
import { TERMS } from '../../lib/copy';

const DEF = 'Each run you complete, whatever the distance or pace.';

describe('MarkDefinitionBlock', () => {
  it('collapses both answers behind tappable questions by default', () => {
    const { getByText, queryByText } = render(<MarkDefinitionBlock definition={DEF} />);
    // Questions are visible…
    expect(getByText('What counts here?')).toBeTruthy();
    expect(getByText("What's a mark?")).toBeTruthy();
    // …but neither answer is shown until tapped.
    expect(queryByText(DEF)).toBeNull();
    expect(queryByText(TERMS.mark)).toBeNull();
  });

  it('reveals the per-mark definition when "What counts here?" is tapped', () => {
    const { getByText, queryByText } = render(<MarkDefinitionBlock definition={DEF} />);
    fireEvent.press(getByText('What counts here?'));
    expect(getByText(DEF)).toBeTruthy();
    // The other reveal stays independent (still collapsed).
    expect(queryByText(TERMS.mark)).toBeNull();
  });

  it('reveals the canonical TERMS.mark when "What\'s a mark?" is tapped', () => {
    const { getByText, queryByText } = render(<MarkDefinitionBlock definition={DEF} />);
    expect(queryByText(TERMS.mark)).toBeNull();
    fireEvent.press(getByText("What's a mark?"));
    expect(getByText(TERMS.mark)).toBeTruthy();
    // The definition reveal stays independent (still collapsed).
    expect(queryByText(DEF)).toBeNull();
  });
});
