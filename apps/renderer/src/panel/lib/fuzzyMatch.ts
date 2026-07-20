/**
 * 简化版 fzf 模糊匹配算法。
 * 规则：连续匹配得分高；单词边界（空格/连字符/下划线/驼峰）处匹配得分高；
 * 标题开头匹配得分最高；不区分大小写。
 */

export interface FuzzyResult {
  /** 匹配分数，越高越好；0 = 不匹配 */
  score: number
  /** 匹配字符的索引位置（用于高亮） */
  matches: number[]
}

/**
 * 计算单个字符是否在单词边界处。
 * 边界：空格、连字符、下划线、大写字母（驼峰）。
 */
function isWordBoundary(text: string, index: number): boolean {
  if (index === 0) return true
  const char = text[index]
  const prev = text[index - 1]
  if (char === ' ' || char === '-' || char === '_') return true
  if (prev === ' ' || prev === '-' || prev === '_') return true
  // 驼峰：前一个小写，当前大写
  if (prev === prev.toLowerCase() && char === char.toUpperCase() && char !== char.toLowerCase())
    return true
  return false
}

/**
 * 模糊匹配：返回匹配分数和匹配位置。
 * 不匹配时返回 { score: 0, matches: [] }。
 */
export function fuzzyMatch(text: string, query: string): FuzzyResult {
  if (!query) return { score: 1, matches: [] }
  const queryLower = query.toLowerCase()
  const textLower = text.toLowerCase()

  // 快速检查：所有查询字符是否都出现在文本中（按顺序）
  let qi = 0
  for (let ti = 0; ti < textLower.length && qi < queryLower.length; ti++) {
    if (textLower[ti] === queryLower[qi]) qi++
  }
  if (qi < queryLower.length) return { score: 0, matches: [] }

  // 计算匹配分数
  let score = 0
  const matches: number[] = []
  qi = 0
  let consecutive = 0

  for (let ti = 0; ti < textLower.length && qi < queryLower.length; ti++) {
    if (textLower[ti] === queryLower[qi]) {
      matches.push(ti)
      // 连续匹配加分
      consecutive++
      score += consecutive * 2

      // 单词边界加分
      if (isWordBoundary(text, ti)) {
        score += 10
      }

      // 开头匹配加分
      if (ti === 0) {
        score += 20
      }

      qi++
    } else {
      consecutive = 0
    }
  }

  // 精确匹配额外加分
  if (queryLower === textLower) {
    score += 50
  }
  // 前缀匹配加分
  else if (textLower.startsWith(queryLower)) {
    score += 30
  }

  return { score, matches }
}

/**
 * 对多个文本进行模糊匹配，返回按分数降序排列的结果。
 */
export function fuzzyMatchAll<T>(
  items: T[],
  query: string,
  getText: (item: T) => string
): Array<{ item: T; result: FuzzyResult }> {
  if (!query) return items.map((item) => ({ item, result: { score: 1, matches: [] } }))

  return items
    .map((item) => ({ item, result: fuzzyMatch(getText(item), query) }))
    .filter((r) => r.result.score > 0)
    .sort((a, b) => b.result.score - a.result.score)
}
