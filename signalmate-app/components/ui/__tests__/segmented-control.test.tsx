import { fireEvent, render } from '@testing-library/react-native';
import { SegmentedControl } from '../segmented-control';

describe('SegmentedControl', () => {
  test('분할 선택은 선택값과 접근성 상태를 노출한다', () => {
    const onChange = jest.fn();
    const screen = render(
      <SegmentedControl
        value="capture"
        onChange={onChange}
        options={[{ value: 'capture', label: '캡처' }, { value: 'text', label: '텍스트' }]}
      />,
    );

    expect(screen.getByRole('button', { name: '캡처' }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    fireEvent.press(screen.getByRole('button', { name: '텍스트' }));
    expect(onChange).toHaveBeenCalledWith('text');
  });
});
