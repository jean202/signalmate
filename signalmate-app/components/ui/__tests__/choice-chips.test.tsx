import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { ChoiceChips } from '../choice-chips';

const options = [
  { value: 'long', label: '이모지/이모티콘을 자주 사용하는 아주 긴 메시지 스타일' },
] as const;

test('긴 레이블은 320pt와 큰 글자에서 chip 안에서 줄바꿈할 수 있다', () => {
  const screen = render(
    <ChoiceChips options={options} value={null} onChange={jest.fn()} />,
  );
  const chip = screen.getByRole('button', { name: options[0].label });
  const label = screen.getByText(options[0].label);

  expect(StyleSheet.flatten(chip.props.style)).toMatchObject({
    maxWidth: '100%',
    flexShrink: 1,
  });
  expect(StyleSheet.flatten(label.props.style)).toMatchObject({
    flexShrink: 1,
    maxWidth: '100%',
  });
});

test('선택해도 border 폭을 바꾸지 않아 주변 chip을 움직이지 않는다', () => {
  const unselected = render(
    <ChoiceChips options={options} value={null} onChange={jest.fn()} />,
  );
  const selected = render(
    <ChoiceChips options={options} value="long" onChange={jest.fn()} />,
  );

  expect(StyleSheet.flatten(unselected.getByRole('button').props.style).borderWidth).toBe(1);
  expect(StyleSheet.flatten(selected.getByRole('button').props.style).borderWidth).toBe(1);
  expect(StyleSheet.flatten(selected.getByRole('button').props.style).borderLeftWidth)
    .toBeUndefined();
});
