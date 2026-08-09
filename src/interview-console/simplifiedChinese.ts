import OpenCC from 'opencc-js/t2cn'

const convertTraditionalToSimplified = OpenCC.Converter({ from: 't', to: 'cn' })

export function toSimplifiedChinese(value: unknown): string {
  const text = String(value ?? '')
  return text ? convertTraditionalToSimplified(text) : ''
}
