import { fireEvent, render } from '@testing-library/react-native';

import { ReplacementRuleEditor } from '../replacement-rule-editor';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = (props: object) => React.createElement(View, props);
  return { Plus: Icon, Trash2: Icon };
});

describe('ReplacementRuleEditor', () => {
  test('치환 적용 전에 일반 문자열 일치 건수를 보여준다', () => {
    const screen = render(<ReplacementRuleEditor text="진하님 안녕, 진하님" />);

    fireEvent.changeText(screen.getByLabelText('원문'), '진하님');
    fireEvent.changeText(screen.getByLabelText('치환값'), '[내이름]');

    expect(screen.getByText('2곳이 변경돼요')).toBeTruthy();
  });

  test('빈 원문은 규칙으로 추가하지 않는다', () => {
    const onRulesChange = jest.fn();
    const screen = render(
      <ReplacementRuleEditor text="대화" onRulesChange={onRulesChange} />,
    );

    fireEvent.changeText(screen.getByLabelText('원문'), '   ');

    const addButton = screen.getByRole('button', { name: '치환 규칙 추가' });
    expect(addButton.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    fireEvent.press(addButton);
    expect(onRulesChange).not.toHaveBeenCalled();
  });

  test('규칙을 추가하고 저장된 규칙을 삭제한다', () => {
    const onRulesChange = jest.fn();
    const screen = render(
      <ReplacementRuleEditor
        text="진하님"
        rules={[{ id: 'saved', source: '회사', replacement: '[직장]' }]}
        onRulesChange={onRulesChange}
      />,
    );

    fireEvent.changeText(screen.getByLabelText('원문'), '진하님');
    fireEvent.changeText(screen.getByLabelText('치환값'), '[내이름]');
    fireEvent.press(screen.getByRole('button', { name: '치환 규칙 추가' }));

    expect(onRulesChange).toHaveBeenLastCalledWith([
      { id: 'saved', source: '회사', replacement: '[직장]' },
      expect.objectContaining({ source: '진하님', replacement: '[내이름]' }),
    ]);

    fireEvent.press(screen.getByRole('button', { name: '회사 치환 규칙 삭제' }));
    expect(onRulesChange).toHaveBeenLastCalledWith([]);
  });

  test('저장된 규칙 전체 적용을 요청한다', () => {
    const rules = [{ id: 'saved', source: '진하', replacement: '[내이름]' }];
    const onApply = jest.fn();
    const screen = render(
      <ReplacementRuleEditor text="진하" rules={rules} onApply={onApply} />,
    );

    fireEvent.press(screen.getByRole('button', { name: '치환 규칙 전체 적용' }));

    expect(onApply).toHaveBeenCalledWith(rules);
  });

  test('저장된 규칙 전체를 적용하기 직전 실제 변경 건수를 보여준다', () => {
    const screen = render(
      <ReplacementRuleEditor
        text="민수와 영희, [민수]"
        rules={[
          { id: 'one', source: '민수', replacement: '[민수]' },
          { id: 'two', source: '영희', replacement: '[상대]' },
        ]}
      />,
    );

    expect(screen.getByText('저장 규칙 전체 적용 시 2곳이 변경돼요')).toBeTruthy();
  });
});
