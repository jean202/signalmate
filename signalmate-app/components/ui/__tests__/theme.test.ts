import { colors } from '../theme';

function relativeLuminance(hex: string) {
  const channels = hex.match(/[\da-f]{2}/gi);
  if (!channels || channels.length !== 3) throw new Error('Expected a six-digit hex color');
  const [red, green, blue] = channels.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('theme contrast', () => {
  test('caution 텍스트는 흰 배경과 cautionSurface에서 4.5:1 이상이다', () => {
    const onBackground = contrastRatio(colors.caution, colors.background);
    const onCautionSurface = contrastRatio(colors.caution, colors.cautionSurface);

    expect(onBackground).toBeGreaterThanOrEqual(4.5);
    expect(onCautionSurface).toBeGreaterThanOrEqual(4.5);
    expect(onBackground).toBeCloseTo(5.2316, 4);
    expect(onCautionSurface).toBeCloseTo(4.9131, 4);
  });
});
