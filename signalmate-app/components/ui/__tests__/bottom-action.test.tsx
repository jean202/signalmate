import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 28, left: 0 }),
}));

import { BottomAction } from '../bottom-action';

describe('BottomAction', () => {
  test('안전 영역 하단 여백을 유지하면서 주요 명령의 44pt 높이를 보장한다', () => {
    const screen = render(<BottomAction primary={{ label: '다음', onPress: jest.fn() }} />);

    expect(StyleSheet.flatten(screen.getByTestId('bottom-action').props.style).paddingBottom).toBe(28);
    expect(StyleSheet.flatten(screen.getByRole('button', { name: '다음' }).props.style).minHeight).toBe(44);
  });
});
