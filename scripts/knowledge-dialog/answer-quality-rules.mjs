const PLACEHOLDER = '【需本人补充】';
const HEADING = /【(口述版回答|结合我的项目|可能追问|不能虚构的内容)】/g;
const EXPLICIT_OR_FULL_REQUEST = /系统设计|架构设计|详细|展开|分步骤|逐步|怎么设计|如何设计|写代码|代码实现|编码|调试|debug|数据结构|算法|复杂度|按.*(?:格式|结构)|用\d+.*(?:点|句)|表格|JSON|伪代码/i;
const BEHAVIORAL_QUESTION = /行为面试|讲一个.*经历|举个.*例子|冲突|失败经历|最大挑战|团队合作|STAR/i;
const SIMPLE_QUESTION = /什么是|是什么意思|是否|能否|会不会|你会|了解吗|熟悉吗/;
const PROTECTED_EVIDENCE = /应包含|应该|建议|可以包含|可采用|如果[^，。；;]{0,16}可(?:以)?(?:采用|使用|包含)|仍需确认|尚未确认/;
const STRONG_IMPLEMENTATION_CLAIM = /项目里有|项目中有|项目已经|项目(?:采用|使用)|已经实现|我实现了|我已实现|我负责实现|我做了|已完成/;
const MODAL_OR_NEGATED = /建议|应该|可以|可采用|如果|条件|尚未|仍需|未实现|没有|没实现|待确认|需确认|不能(?:说|算)[^，。；]{0,8}(?:项目)?(?:已经|已)?实现|不代表[^，。；]{0,8}(?:项目)?(?:已经|已)?实现|并非(?:项目)?(?:已经|已)?实现|不是(?:项目)?(?:已经|已)?实现/;
const HIGH_SPECIFICITY_TERMS = /共享内存|信号量|魔数|POSIX|SPI|DMA|UART|I2C|CAN|RTOS/i;

export function canonicalNumericClaim(value) {
  const raw = String(value);
  const percent = raw.endsWith('%');
  const numericText = (percent ? raw.slice(0, -1) : raw).replaceAll(',', '');
  const numeric = Number(numericText);
  return Number.isFinite(numeric) ? `${percent ? 'percent' : 'number'}:${numeric}` : null;
}

function parseSections(answer) {
  const text = String(answer);
  const matches = [...text.matchAll(HEADING)];
  const sections = new Map();
  const unsectioned = text.slice(0, matches[0]?.index ?? text.length);
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    const body = text.slice(start, end);
    sections.set(match[1], `${sections.get(match[1]) ?? ''}${body}`);
  }
  return { sections, unsectioned, hasSections: matches.length > 0 };
}

export function hasUnsafePlaceholder(answer) {
  const { sections, unsectioned } = parseSections(answer);
  if (unsectioned.includes(PLACEHOLDER)) return true;
  for (const [name, body] of sections) {
    if (name !== '不能虚构的内容' && body.includes(PLACEHOLDER)) return true;
  }
  return false;
}

export function countSpokenUnits(text) {
  const value = String(text);
  const hanCount = (value.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinNumericTokens = value.match(/[A-Za-z0-9]+(?:[._/-][A-Za-z0-9]+)*/g) ?? [];
  return hanCount + latinNumericTokens.length;
}

export function classifyAnswerLengthBudget(question) {
  const value = String(question);
  if (EXPLICIT_OR_FULL_REQUEST.test(value)) return { kind: 'full', min: null, max: null, enforce: false };
  if (BEHAVIORAL_QUESTION.test(value)) return { kind: 'behavioral', min: 60, max: 110, enforce: true };
  if (SIMPLE_QUESTION.test(value)) return { kind: 'simple', min: 15, max: 35, enforce: true };
  return { kind: 'normal', min: 25, max: 55, enforce: true };
}

function expectedForUnit(rawPerSecond, unit, inputIsBits) {
  const bitsPerSecond = inputIsBits ? rawPerSecond : rawPerSecond * 8;
  if (unit === 'kB') return bitsPerSecond / 8 / 1000;
  if (unit === 'KB') return bitsPerSecond / 8 / 1000;
  if (unit === 'KiB') return bitsPerSecond / 8 / 1024;
  if (unit === 'kb') return bitsPerSecond / 1000;
  if (unit === 'Kib') return bitsPerSecond / 1024;
  if (unit === 'B') return bitsPerSecond / 8;
  if (unit === 'b') return bitsPerSecond;
  return Number.NaN;
}

function arithmeticChecks(answer) {
  const checks = [];
  const clauseMatches = [...String(answer).matchAll(/[^。；;\n]+/g)];
  for (const clauseMatch of clauseMatches) {
    const clause = clauseMatch[0];
    const clauseStart = clauseMatch.index;
    const mhzInputs = [...clause.matchAll(/(\d+(?:\.\d+)?)\s*MHz/gi)];
    const localSpiConversions = [...clause.matchAll(/(?:SPI|spi|raw bit rate|原始比特率)[^。；;\n]{0,80}?(\d+(?:\.\d+)?)\s*MHz[^。；;\n]{0,40}?(?:裸带宽|原始带宽|换算|对应)[^。；;\n]{0,20}?(\d+(?:\.\d+)?)\s*(KiB|Kib|KB|kB|kb|B|b)\s*\/\s*s/g)];
    if (localSpiConversions.length === 1 && mhzInputs.length === 1 && !/CPU|DDR|多通道|双通道|lane/i.test(clause)) {
      const match = localSpiConversions[0];
      const rawBitsPerSecond = Number(match[1]) * 1e6;
      checks.push({
        source: `${match[1]}MHz`, claim: match[2], unit: match[3],
        expected: expectedForUnit(rawBitsPerSecond, match[3], true),
        claimStart: clauseStart + match.index + match[0].lastIndexOf(match[2]),
      });
    }

    const outputs = [...clause.matchAll(/(\d+(?:\.\d+)?)\s*(KiB|Kib|KB|kB|kb|B|b)\s*\/\s*s/g)];
    if (outputs.length !== 1 || !/(?:×|\*|所以|对应|换算|约为|得到|=)/.test(clause)) continue;

    const explicitBitRate = /原始(?:比特|bit)率|bit[ -]?rate|每字节\s*8\s*位|[÷/]\s*8/i.test(clause);
    if (mhzInputs.length === 1 && explicitBitRate && !/CPU|DDR|多通道|双通道|lane/i.test(clause)) {
      const rawBitsPerSecond = Number(mhzInputs[0][1]) * 1e6;
      checks.push({
        source: `${mhzInputs[0][1]}MHz`, claim: outputs[0][1], unit: outputs[0][2],
        expected: expectedForUnit(rawBitsPerSecond, outputs[0][2], true),
        claimStart: clauseStart + outputs[0].index,
      });
      continue;
    }

    const byteFpsInputs = [...clause.matchAll(/(\d+(?:\.\d+)?)\s*(?:bytes?|字节)\s*[×xX*]\s*(\d+(?:\.\d+)?)\s*(?:fps|帧(?:\s*\/\s*秒)?)/gi)];
    if (byteFpsInputs.length === 1 && mhzInputs.length === 0) {
      const rawBytesPerSecond = Number(byteFpsInputs[0][1]) * Number(byteFpsInputs[0][2]);
      checks.push({
        source: `${byteFpsInputs[0][1]} bytes × ${byteFpsInputs[0][2]}fps`, claim: outputs[0][1], unit: outputs[0][2],
        expected: expectedForUnit(rawBytesPerSecond, outputs[0][2], false),
        claimStart: clauseStart + outputs[0].index,
      });
    }
  }
  return [...new Map(checks.map((check) => [
    `${check.source}|${check.claim}|${check.unit}|${check.expected}|${check.claimStart}`,
    check,
  ])).values()];
}

function clauses(text) {
  return String(text).split(/[。；;\n]+/).map((clause) => clause.trim()).filter(Boolean);
}

function evidenceClauses(text) {
  return String(text).split(/[。；;，,\n]+/).map((clause) => clause.trim()).filter(Boolean);
}

function isStrongFactClause(text) {
  return STRONG_IMPLEMENTATION_CLAIM.test(text) && !MODAL_OR_NEGATED.test(text);
}

function guardedEvidenceSegments(text) {
  const guarded = [];
  for (const sentence of clauses(text)) {
    const commaParts = sentence.split(/[，,]+/).map((part) => part.trim()).filter(Boolean);
    for (let index = 0; index < commaParts.length; index += 1) {
      if (!PROTECTED_EVIDENCE.test(commaParts[index])) continue;
      const continuation = [];
      for (let cursor = index; cursor < commaParts.length; cursor += 1) {
        if (cursor > index && (/已确认|明确记录|事实是/.test(commaParts[cursor]) || isStrongFactClause(commaParts[cursor]))) break;
        continuation.push(commaParts[cursor]);
      }
      guarded.push(continuation.join('，'));
    }
  }
  return guarded;
}

function termsFromGuardedSegment(segment, entryKeywords) {
  const marker = segment.match(PROTECTED_EVIDENCE);
  if (!marker) return [];
  const uncertainty = /仍需确认|尚未确认/.test(marker[0]);
  const scope = uncertainty
    ? segment.slice(0, marker.index)
    : segment.slice(marker.index + marker[0].length);
  const terms = entryKeywords.filter((term) => scope.toLowerCase().includes(term.toLowerCase()));
  const pieces = scope.split(/以及|和|及|与|[、，,\s]+/).map((part) => part.trim()).filter(Boolean);
  for (const piece of pieces) {
    const cleaned = piece.replace(/^(?:采用|使用|包含|配置|添加)/, '');
    if (/^[\u3400-\u9fff]{2,8}$/.test(cleaned)) terms.push(cleaned);
    terms.push(...(cleaned.match(/[A-Za-z][A-Za-z0-9_]{1,31}/g) ?? []));
  }
  return [...new Set(terms)];
}

function isHighSpecificity(term) {
  return /[A-Za-z0-9_]{3,}/.test(term) || HIGH_SPECIFICITY_TERMS.test(term) || term.length >= 4;
}

function evidenceBoundaryIssue(answer, citedEntries) {
  const strongClauses = evidenceClauses(answer).filter(isStrongFactClause);
  if (strongClauses.length === 0) return null;
  for (const entry of citedEntries) {
    const entryKeywords = (entry?.keywords ?? []).map((term) => String(term).trim()).filter((term) => term.length >= 2);
    const guardedClauses = guardedEvidenceSegments([entry?.title, entry?.content].filter(Boolean).join('；'));
    for (const guardedClause of guardedClauses) {
      const guardedTerms = termsFromGuardedSegment(guardedClause, entryKeywords);
      for (const answerClause of strongClauses) {
        const shared = guardedTerms.filter((term) => answerClause.toLowerCase().includes(term.toLowerCase()));
        if (shared.some(isHighSpecificity) || shared.length >= 2) {
          return `回答把受保护的建议或待确认内容表述为已实现事实，共享术语：${shared.join('、')}。`;
        }
      }
    }
  }
  return null;
}

/** Pure deterministic checks; callers attach protocol ids and evidence ids. */
export function analyzeAnswerQuality({ question, answer, citedEntries = [] }) {
  const issues = [];
  const verifiedDerivedOccurrences = new Set();
  const { sections, hasSections } = parseSections(answer);
  const spoken = sections.get('口述版回答') ?? (hasSections ? '' : String(answer));
  const budget = classifyAnswerLengthBudget(question);
  if (budget.enforce) {
    const units = countSpokenUnits(spoken);
    if (units > budget.max) issues.push({ type: 'overlong-answer', explanation: `${budget.kind} 问题的口述版回答共有 ${units} 个口述单位，超过 ${budget.max} 个单位。` });
  }

  for (const check of arithmeticChecks(answer)) {
    const claimed = Number(check.claim);
    const relativeError = Math.abs(claimed - check.expected) / check.expected;
    if (Number.isFinite(relativeError) && relativeError > 0.05 + Number.EPSILON) {
      issues.push({ type: 'arithmetic-error', explanation: `${check.source} 的换算结果应约为 ${check.expected}${check.unit}/s，回答中的 ${check.claim}${check.unit}/s 误差超过 5%。` });
    } else if (Number.isFinite(relativeError)) {
      verifiedDerivedOccurrences.add(`${canonicalNumericClaim(check.claim)}@${check.claimStart}`);
    }
  }

  const boundaryExplanation = evidenceBoundaryIssue(answer, citedEntries);
  if (boundaryExplanation) issues.push({ type: 'evidence-boundary', explanation: boundaryExplanation });
  return { issues, verifiedDerivedOccurrences };
}
