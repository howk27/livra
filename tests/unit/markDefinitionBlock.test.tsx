import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { MarkDefinitionBlock } from '../../components/mark/MarkDefinitionBlock';
import { TERMS } from '../../lib/copy';

describe('MarkDefinitionBlock', () => {
  it('shows the per-mark definition', () => {
    const { getByText } = render(
      <MarkDefinitionBlock definition="Each run you complete, whatever the distance or pace." />,
    );
    expect(getByText('Each run you complete, whatever the distance or pace.')).toBeTruthy();
  });

  it('reveals the canonical TERMS.mark when the affordance is tapped', () => {
    const { getByText, queryByText } = render(
      <MarkDefinitionBlock definition="Each run you complete, whatever the distance or pace." />,
    );
    expect(queryByText(TERMS.mark)).toBeNull();
    fireEvent.press(getByText("What's a mark?"));
    expect(getByText(TERMS.mark)).toBeTruthy();
  });
});
