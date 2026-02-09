/**
 * Enhanced HTML → Figma Plugin API Script converter (v2)
 * Run the output in Figma using the free "Scripter" plugin.
 *
 * Key mapping:
 *   CSS display:flex      → FRAME with layoutMode (auto-layout)
 *   flex-direction        → HORIZONTAL / VERTICAL
 *   flex-wrap: wrap       → layoutWrap: WRAP
 *   justify-content       → primaryAxisAlignItems
 *   align-items           → counterAxisAlignItems
 *   gap                   → itemSpacing + counterAxisSpacing
 *   padding               → paddingTop/Right/Bottom/Left
 *   flex-grow             → layoutGrow (FILL on primary axis)
 *   align-self/stretch    → layoutAlign: STRETCH (FILL on cross axis)
 *   background-color      → fills (SOLID)
 *   border                → strokes + strokeWeight
 *   border-radius         → cornerRadius (uniform) or per-corner
 *   box-shadow            → effects (DROP_SHADOW / INNER_SHADOW)
 *   font-*                → fontSize, fontName
 *   text-align            → textAlignHorizontal
 *   text-decoration       → textDecoration
 *   text-transform        → textCase
 *   <img>                 → RECTANGLE with image fill (async load)
 *   display:grid          → auto-layout approximation
 *   textAutoResize        → WIDTH_AND_HEIGHT / HEIGHT based on content
 */

// ── Helpers ──────────────────────────────────────────────

function toRgb01(color: string): { r: number; g: number; b: number } | null {
  if (!color) return null;
  if (color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return null;
  const m = color.match(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return null;
  return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255 };
}

function alpha(color: string): number {
  const m = color.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
  return m ? parseFloat(m[1]) : 1;
}

function mapJustify(v: string): string {
  switch (v) {
    case 'center': return 'CENTER';
    case 'flex-end': case 'end': return 'MAX';
    case 'space-between': return 'SPACE_BETWEEN';
    case 'space-around': return 'SPACE_BETWEEN';
    case 'space-evenly': return 'SPACE_BETWEEN';
    default: return 'MIN';
  }
}

function mapAlign(v: string): string {
  switch (v) {
    case 'center': return 'CENTER';
    case 'flex-end': case 'end': return 'MAX';
    case 'baseline': return 'BASELINE';
    default: return 'MIN';
  }
}

function mapFontStyle(weight: string, fontStyle: string): string {
  const w = parseInt(weight) || 400;
  const italic = fontStyle === 'italic';
  let name = 'Regular';
  if (w >= 900) name = 'Black';
  else if (w >= 800) name = 'ExtraBold';
  else if (w >= 700) name = 'Bold';
  else if (w >= 600) name = 'SemiBold';
  else if (w >= 500) name = 'Medium';
  else if (w <= 200) name = 'Thin';
  else if (w <= 300) name = 'Light';
  if (italic) name += ' Italic';
  return name;
}

function parseShadows(shadow: string): Array<{
  offsetX: number; offsetY: number; blur: number; spread: number;
  color: { r: number; g: number; b: number }; opacity: number;
  inset: boolean;
}> {
  if (!shadow || shadow === 'none') return [];
  const results: Array<{
    offsetX: number; offsetY: number; blur: number; spread: number;
    color: { r: number; g: number; b: number }; opacity: number;
    inset: boolean;
  }> = [];
  const parts = shadow.split(/,(?![^(]*\))/);
  for (const part of parts) {
    const trimmed = part.trim();
    const isInset = trimmed.includes('inset');
    const cleaned = trimmed.replace('inset', '').trim();
    const colorMatch = cleaned.match(/rgba?\([^)]+\)/);
    if (!colorMatch) continue;
    const color = toRgb01(colorMatch[0]);
    if (!color) continue;
    const a = alpha(colorMatch[0]);
    const nums = cleaned.replace(colorMatch[0], '').trim().match(/-?[\d.]+/g);
    if (!nums || nums.length < 2) continue;
    results.push({
      offsetX: parseFloat(nums[0]) || 0,
      offsetY: parseFloat(nums[1]) || 0,
      blur: parseFloat(nums[2]) || 0,
      spread: parseFloat(nums[3]) || 0,
      color,
      opacity: a,
      inset: isInset,
    });
  }
  return results;
}

const SKIP = new Set(['script', 'style', 'link', 'meta', 'head', 'noscript', 'br', 'hr', 'template']);

// ── Node types ───────────────────────────────────────────

interface FigmaFill {
  type: 'SOLID';
  color: { r: number; g: number; b: number };
  opacity?: number;
}

interface FigmaStroke {
  type: 'SOLID';
  color: { r: number; g: number; b: number };
}

interface FigmaEffect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW';
  color: { r: number; g: number; b: number; a: number };
  offset: { x: number; y: number };
  radius: number;
  spread: number;
}

interface FigmaNode {
  type: 'FRAME' | 'TEXT' | 'RECT';
  name: string;
  w: number;
  h: number;
  // Auto-layout
  layoutMode?: 'HORIZONTAL' | 'VERTICAL';
  layoutWrap?: 'WRAP';
  itemSpacing?: number;
  counterAxisSpacing?: number;
  pt?: number; pr?: number; pb?: number; pl?: number;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  primaryAxisSizingMode?: 'AUTO' | 'FIXED';
  counterAxisSizingMode?: 'AUTO' | 'FIXED';
  // Child layout (applied after appendChild)
  layoutGrow?: number;
  layoutAlign?: 'STRETCH' | 'INHERIT';
  // Visual
  fills?: FigmaFill[];
  strokes?: FigmaStroke[];
  strokeWeight?: number;
  cornerRadius?: number;
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomRightRadius?: number;
  bottomLeftRadius?: number;
  opacity?: number;
  clipsContent?: boolean;
  effects?: FigmaEffect[];
  // Text
  chars?: string;
  fontSize?: number;
  fontFamily?: string;
  fontStyle?: string;
  textColor?: { r: number; g: number; b: number };
  textAlignH?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
  lineHeightPx?: number;
  letterSpacing?: number;
  textAutoResize?: 'WIDTH_AND_HEIGHT' | 'HEIGHT' | 'NONE';
  textDecoration?: 'UNDERLINE' | 'STRIKETHROUGH';
  textCase?: 'UPPER' | 'LOWER' | 'TITLE';
  // Image
  imageUrl?: string;
  // Children
  children?: FigmaNode[];
}

// ── Parent context for child sizing decisions ────────────

interface ParentContext {
  isFlex: boolean;
  isRow: boolean;
  alignItems: string;
}

// ── Corner radius parser ─────────────────────────────────

function parseCornerRadius(cs: CSSStyleDeclaration): {
  cornerRadius: number;
  topLeftRadius?: number;
  topRightRadius?: number;
  bottomRightRadius?: number;
  bottomLeftRadius?: number;
} {
  const tl = Math.round(parseFloat(cs.borderTopLeftRadius) || 0);
  const tr = Math.round(parseFloat(cs.borderTopRightRadius) || 0);
  const br = Math.round(parseFloat(cs.borderBottomRightRadius) || 0);
  const bl = Math.round(parseFloat(cs.borderBottomLeftRadius) || 0);

  if (tl === tr && tr === br && br === bl) {
    return { cornerRadius: tl };
  }
  return {
    cornerRadius: 0,
    topLeftRadius: tl,
    topRightRadius: tr,
    bottomRightRadius: br,
    bottomLeftRadius: bl,
  };
}

// ── Shadow effects parser ────────────────────────────────

function toEffects(boxShadow: string): FigmaEffect[] {
  return parseShadows(boxShadow).map(s => ({
    type: (s.inset ? 'INNER_SHADOW' : 'DROP_SHADOW') as 'DROP_SHADOW' | 'INNER_SHADOW',
    color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.opacity },
    offset: { x: s.offsetX, y: s.offsetY },
    radius: s.blur,
    spread: s.spread,
  }));
}

// ── Text node creator ────────────────────────────────────

function createTextNode(
  el: Element, cs: CSSStyleDeclaration, text: string,
  w: number, h: number, opacity: number,
  layoutGrow?: number, layoutAlign?: 'STRETCH' | 'INHERIT'
): FigmaNode {
  const fontSize = Math.round(parseFloat(cs.fontSize) || 14);
  const fontFamily = cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
  const fStyle = mapFontStyle(cs.fontWeight, cs.fontStyle);
  const textColor = toRgb01(cs.color);

  let textAlignH: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED' = 'LEFT';
  if (cs.textAlign === 'center') textAlignH = 'CENTER';
  else if (cs.textAlign === 'right' || cs.textAlign === 'end') textAlignH = 'RIGHT';
  else if (cs.textAlign === 'justify') textAlignH = 'JUSTIFIED';

  const lineH = parseFloat(cs.lineHeight);
  const ls = parseFloat(cs.letterSpacing) || 0;

  let textDecoration: 'UNDERLINE' | 'STRIKETHROUGH' | undefined;
  if (cs.textDecorationLine?.includes('underline')) textDecoration = 'UNDERLINE';
  else if (cs.textDecorationLine?.includes('line-through')) textDecoration = 'STRIKETHROUGH';

  let textCase: 'UPPER' | 'LOWER' | 'TITLE' | undefined;
  if (cs.textTransform === 'uppercase') textCase = 'UPPER';
  else if (cs.textTransform === 'lowercase') textCase = 'LOWER';
  else if (cs.textTransform === 'capitalize') textCase = 'TITLE';

  const isMultiLine = h > fontSize * 1.8;
  const textAutoResize: 'WIDTH_AND_HEIGHT' | 'HEIGHT' = isMultiLine ? 'HEIGHT' : 'WIDTH_AND_HEIGHT';

  const bg = toRgb01(cs.backgroundColor);
  const bgA = alpha(cs.backgroundColor);
  const hasBg = bg && bgA > 0;
  const bw = parseFloat(cs.borderTopWidth) || 0;
  const cr = parseCornerRadius(cs);
  const effects = toEffects(cs.boxShadow);

  const textNode: FigmaNode = {
    type: 'TEXT',
    name: text.slice(0, 30),
    w, h,
    chars: text,
    fontSize,
    fontFamily,
    fontStyle: fStyle,
    textColor: textColor || { r: 0, g: 0, b: 0 },
    textAlignH,
    lineHeightPx: isNaN(lineH) ? undefined : Math.round(lineH),
    letterSpacing: ls || undefined,
    textAutoResize,
    textDecoration,
    textCase,
    opacity: opacity < 1 ? opacity : undefined,
  };

  // If element has background/border/radius/shadow → wrap in a frame
  const hasVisual = hasBg || bw > 0 || cr.cornerRadius > 0 ||
    (cr.topLeftRadius || 0) > 0 || effects.length > 0;

  if (hasVisual) {
    const fills: FigmaFill[] = [];
    if (hasBg && bg) fills.push({ type: 'SOLID', color: bg, opacity: bgA < 1 ? bgA : undefined });
    const strokes: FigmaStroke[] = [];
    if (bw > 0) {
      const bc = toRgb01(cs.borderTopColor || cs.borderColor);
      if (bc) strokes.push({ type: 'SOLID', color: bc });
    }

    const pt = Math.round(parseFloat(cs.paddingTop) || 0);
    const prVal = Math.round(parseFloat(cs.paddingRight) || 0);
    const pb = Math.round(parseFloat(cs.paddingBottom) || 0);
    const plVal = Math.round(parseFloat(cs.paddingLeft) || 0);

    textNode.textAutoResize = 'HEIGHT';
    textNode.layoutAlign = 'STRETCH';

    return {
      type: 'FRAME',
      name: el.tagName.toLowerCase(),
      w, h,
      layoutMode: 'VERTICAL',
      primaryAxisSizingMode: 'AUTO',
      counterAxisSizingMode: 'FIXED',
      pt, pr: prVal, pb, pl: plVal,
      fills,
      strokes,
      strokeWeight: bw || undefined,
      ...cr,
      opacity: opacity < 1 ? opacity : undefined,
      clipsContent: cs.overflow === 'hidden',
      effects: effects.length > 0 ? effects : undefined,
      layoutGrow,
      layoutAlign,
      children: [textNode],
    };
  }

  textNode.layoutGrow = layoutGrow;
  textNode.layoutAlign = layoutAlign;
  return textNode;
}

// ── DOM Walker ───────────────────────────────────────────

function walkDom(el: Element, win: Window, parentCtx?: ParentContext): FigmaNode | null {
  const tag = el.tagName.toLowerCase();
  if (SKIP.has(tag)) return null;

  const cs = win.getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden') return null;

  const box = el.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return null;

  const w = Math.round(box.width);
  const h = Math.round(box.height);
  const opacity = parseFloat(cs.opacity);
  if (opacity <= 0) return null;

  // ── Child layout properties (determined by parent context) ──
  let layoutGrow: number | undefined;
  let layoutAlign: 'STRETCH' | 'INHERIT' | undefined;

  if (parentCtx?.isFlex) {
    const flexGrow = parseFloat(cs.flexGrow) || 0;
    layoutGrow = flexGrow > 0 ? 1 : 0;

    const alignSelf = cs.alignSelf;
    if (alignSelf === 'stretch' || (alignSelf === 'auto' && parentCtx.alignItems === 'stretch')) {
      layoutAlign = 'STRETCH';
    } else {
      layoutAlign = 'INHERIT';
    }
  }

  // ── Handle <img> ──
  if (tag === 'img') {
    const src = (el as HTMLImageElement).src || '';
    const cr = parseCornerRadius(cs);
    return {
      type: 'RECT',
      name: 'Image',
      w, h,
      ...cr,
      imageUrl: src,
      fills: [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.85 } }],
      layoutGrow,
      layoutAlign,
    };
  }

  // ── Handle <svg> (icons) ──
  if (tag === 'svg') {
    const color = toRgb01(cs.color);
    return {
      type: 'RECT',
      name: 'Icon',
      w, h,
      cornerRadius: Math.round(parseFloat(cs.borderRadius) || 0) || 4,
      fills: color ? [{ type: 'SOLID', color }] : [{ type: 'SOLID', color: { r: 0.6, g: 0.6, b: 0.6 } }],
      layoutGrow,
      layoutAlign,
    };
  }

  // ── Detect layout mode ──
  const isFlex = cs.display.includes('flex');
  const isGrid = cs.display.includes('grid');
  const isRow = cs.flexDirection === 'row' || cs.flexDirection === 'row-reverse';
  const isWrap = cs.flexWrap === 'wrap' || cs.flexWrap === 'wrap-reverse';

  const gap = parseFloat(cs.gap) || 0;
  const columnGap = parseFloat(cs.columnGap) || gap;
  const rowGap = parseFloat(cs.rowGap) || gap;

  // Grid → approximate as horizontal/vertical
  let gridIsRow = false;
  if (isGrid) {
    const cols = cs.gridTemplateColumns;
    if (cols && cols !== 'none') {
      const colCount = cols.split(/\s+/).filter(c => c && c !== 'none').length;
      gridIsRow = colCount > 1;
    }
  }

  const effectiveIsRow = isFlex ? isRow : (isGrid ? gridIsRow : false);
  const effectiveIsFlex = isFlex || isGrid;
  const effectiveIsWrap = isWrap || (isGrid && gridIsRow);

  // ── Context for children ──
  const childCtx: ParentContext = {
    isFlex: effectiveIsFlex,
    isRow: effectiveIsRow,
    alignItems: cs.alignItems,
  };

  // ── Collect children ──
  const children: FigmaNode[] = [];
  let directText = '';

  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = child.textContent?.trim();
      if (t) directText += (directText ? '\n' : '') + t;
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const childNode = walkDom(child as Element, win, childCtx);
      if (childNode) children.push(childNode);
    }
  }

  // ── Pure text element (no element children, has text) ──
  if (children.length === 0 && directText) {
    return createTextNode(el, cs, directText, w, h, opacity, layoutGrow, layoutAlign);
  }

  // ── Container (FRAME) ──
  const fills: FigmaFill[] = [];
  const bg = toRgb01(cs.backgroundColor);
  const bgA = alpha(cs.backgroundColor);
  if (bg && bgA > 0) {
    fills.push({ type: 'SOLID', color: bg, opacity: bgA < 1 ? bgA : undefined });
  }

  const strokes: FigmaStroke[] = [];
  const bw = parseFloat(cs.borderTopWidth) || 0;
  if (bw > 0) {
    const bc = toRgb01(cs.borderTopColor || cs.borderColor);
    if (bc) strokes.push({ type: 'SOLID', color: bc });
  }

  const cr = parseCornerRadius(cs);
  const pt = Math.round(parseFloat(cs.paddingTop) || 0);
  const prVal = Math.round(parseFloat(cs.paddingRight) || 0);
  const pb = Math.round(parseFloat(cs.paddingBottom) || 0);
  const plVal = Math.round(parseFloat(cs.paddingLeft) || 0);
  const effects = toEffects(cs.boxShadow);

  // If element has both text and child elements, prepend text as TEXT node
  if (directText && children.length > 0) {
    const fontSize = Math.round(parseFloat(cs.fontSize) || 14);
    const fontFamily = cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
    const textColor = toRgb01(cs.color);
    children.unshift({
      type: 'TEXT',
      name: directText.slice(0, 20),
      w: w - plVal - prVal,
      h: Math.round(fontSize * 1.4),
      chars: directText,
      fontSize,
      fontFamily,
      fontStyle: mapFontStyle(cs.fontWeight, cs.fontStyle),
      textColor: textColor || { r: 0, g: 0, b: 0 },
      textAutoResize: 'HEIGHT',
      layoutAlign: 'STRETCH',
    });
  }

  // Flatten: single child with no visual container → pass through
  if (children.length === 1 && fills.length === 0 && strokes.length === 0 &&
      cr.cornerRadius === 0 && !(cr.topLeftRadius) && opacity >= 1 &&
      effects.length === 0 && pt === 0 && prVal === 0 && pb === 0 && plVal === 0) {
    const child = children[0];
    if (child.w < w) child.w = w;
    if (layoutGrow !== undefined) child.layoutGrow = layoutGrow;
    if (layoutAlign !== undefined) child.layoutAlign = layoutAlign;
    return child;
  }

  const layoutMode: 'HORIZONTAL' | 'VERTICAL' = effectiveIsRow ? 'HORIZONTAL' : 'VERTICAL';
  const itemSpacing = effectiveIsRow ? Math.round(columnGap) : Math.round(rowGap);
  const counterAxisSpacing = effectiveIsWrap
    ? (effectiveIsRow ? Math.round(rowGap) : Math.round(columnGap))
    : undefined;

  return {
    type: 'FRAME',
    name: tag + (el.id ? `#${el.id}` : '') + (el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : ''),
    w, h,
    layoutMode,
    layoutWrap: effectiveIsWrap ? 'WRAP' : undefined,
    itemSpacing: itemSpacing || 0,
    counterAxisSpacing,
    pt, pr: prVal, pb, pl: plVal,
    primaryAxisAlignItems: mapJustify(cs.justifyContent),
    counterAxisAlignItems: mapAlign(cs.alignItems),
    primaryAxisSizingMode: 'FIXED',
    counterAxisSizingMode: 'FIXED',
    layoutGrow,
    layoutAlign,
    fills,
    strokes,
    strokeWeight: bw || undefined,
    ...cr,
    opacity: opacity < 1 ? opacity : undefined,
    clipsContent: cs.overflow === 'hidden' || cs.overflow === 'clip' || cs.overflow === 'scroll' || cs.overflow === 'auto',
    effects: effects.length > 0 ? effects : undefined,
    children,
  };
}

// ── Script Generator (flat variable approach) ────────────

interface ScriptCtx {
  lines: string[];
  counter: number;
  hasImages: boolean;
}

function collectFonts(node: FigmaNode, fonts: Set<string>): void {
  if (node.type === 'TEXT' && node.fontFamily) {
    fonts.add(`${node.fontFamily}:::${node.fontStyle || 'Regular'}`);
  }
  if (node.children) {
    for (const c of node.children) collectFonts(c, fonts);
  }
}

function v(num: number): string {
  return (Math.round(num * 1000) / 1000).toString();
}

function emitCornerRadius(varName: string, node: FigmaNode, L: string[]) {
  if (node.topLeftRadius !== undefined || node.topRightRadius !== undefined ||
      node.bottomRightRadius !== undefined || node.bottomLeftRadius !== undefined) {
    L.push(`  ${varName}.topLeftRadius = ${node.topLeftRadius || 0};`);
    L.push(`  ${varName}.topRightRadius = ${node.topRightRadius || 0};`);
    L.push(`  ${varName}.bottomRightRadius = ${node.bottomRightRadius || 0};`);
    L.push(`  ${varName}.bottomLeftRadius = ${node.bottomLeftRadius || 0};`);
  } else if (node.cornerRadius) {
    L.push(`  ${varName}.cornerRadius = ${node.cornerRadius};`);
  }
}

function emitEffects(varName: string, effects: FigmaEffect[], L: string[]) {
  const parts = effects.map(e =>
    `{ type: '${e.type}', color: { r: ${v(e.color.r)}, g: ${v(e.color.g)}, b: ${v(e.color.b)}, a: ${v(e.color.a)} }, offset: { x: ${e.offset.x}, y: ${e.offset.y} }, radius: ${e.radius}, spread: ${e.spread}, visible: true }`
  );
  L.push(`  ${varName}.effects = [${parts.join(', ')}];`);
}

function emitNode(node: FigmaNode, ctx: ScriptCtx): string {
  const name = `n${ctx.counter++}`;
  const L = ctx.lines;

  if (node.type === 'TEXT') {
    L.push(`  const ${name} = figma.createText();`);
    L.push(`  ${name}.name = ${JSON.stringify(node.name.slice(0, 40))};`);
    if (node.fontFamily) {
      L.push(`  ${name}.fontName = { family: ${JSON.stringify(node.fontFamily)}, style: ${JSON.stringify(node.fontStyle || 'Regular')} };`);
    }
    L.push(`  ${name}.characters = ${JSON.stringify(node.chars || '')};`);
    L.push(`  ${name}.fontSize = ${node.fontSize || 14};`);
    if (node.textColor) {
      L.push(`  ${name}.fills = [{ type: 'SOLID', color: { r: ${v(node.textColor.r)}, g: ${v(node.textColor.g)}, b: ${v(node.textColor.b)} } }];`);
    }
    if (node.textAlignH) L.push(`  ${name}.textAlignHorizontal = '${node.textAlignH}';`);
    if (node.lineHeightPx) L.push(`  ${name}.lineHeight = { value: ${node.lineHeightPx}, unit: 'PIXELS' };`);
    if (node.letterSpacing) L.push(`  ${name}.letterSpacing = { value: ${Math.round(node.letterSpacing * 10) / 10}, unit: 'PIXELS' };`);
    if (node.textAutoResize) L.push(`  ${name}.textAutoResize = '${node.textAutoResize}';`);
    if (node.textDecoration) L.push(`  ${name}.textDecoration = '${node.textDecoration}';`);
    if (node.textCase) L.push(`  ${name}.textCase = '${node.textCase}';`);
    L.push(`  ${name}.resize(${node.w}, ${node.h});`);
    if (node.opacity !== undefined) L.push(`  ${name}.opacity = ${v(node.opacity)};`);

  } else if (node.type === 'RECT') {
    L.push(`  const ${name} = figma.createRectangle();`);
    L.push(`  ${name}.name = ${JSON.stringify(node.name)};`);
    L.push(`  ${name}.resize(${node.w}, ${node.h});`);
    emitCornerRadius(name, node, L);
    if (node.fills && node.fills.length > 0) {
      const fill = node.fills[0];
      L.push(`  ${name}.fills = [{ type: 'SOLID', color: { r: ${v(fill.color.r)}, g: ${v(fill.color.g)}, b: ${v(fill.color.b)} }${fill.opacity !== undefined ? `, opacity: ${v(fill.opacity)}` : ''} }];`);
    }
    if (node.imageUrl) {
      ctx.hasImages = true;
      L.push(`  try { const img${ctx.counter} = await figma.createImageAsync(${JSON.stringify(node.imageUrl)}); ${name}.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: img${ctx.counter}.hash }]; } catch(e) {}`);
    }

  } else {
    // FRAME
    L.push(`  const ${name} = figma.createFrame();`);
    L.push(`  ${name}.name = ${JSON.stringify(node.name.slice(0, 50))};`);
    L.push(`  ${name}.resize(${node.w}, ${node.h});`);

    if (node.layoutMode) {
      L.push(`  ${name}.layoutMode = '${node.layoutMode}';`);
      if (node.layoutWrap) L.push(`  ${name}.layoutWrap = '${node.layoutWrap}';`);
      L.push(`  ${name}.primaryAxisSizingMode = '${node.primaryAxisSizingMode || 'FIXED'}';`);
      L.push(`  ${name}.counterAxisSizingMode = '${node.counterAxisSizingMode || 'FIXED'}';`);
      if (node.itemSpacing) L.push(`  ${name}.itemSpacing = ${node.itemSpacing};`);
      if (node.counterAxisSpacing !== undefined) L.push(`  ${name}.counterAxisSpacing = ${node.counterAxisSpacing};`);
      if (node.pt) L.push(`  ${name}.paddingTop = ${node.pt};`);
      if (node.pr) L.push(`  ${name}.paddingRight = ${node.pr};`);
      if (node.pb) L.push(`  ${name}.paddingBottom = ${node.pb};`);
      if (node.pl) L.push(`  ${name}.paddingLeft = ${node.pl};`);
      if (node.primaryAxisAlignItems) L.push(`  ${name}.primaryAxisAlignItems = '${node.primaryAxisAlignItems}';`);
      if (node.counterAxisAlignItems) L.push(`  ${name}.counterAxisAlignItems = '${node.counterAxisAlignItems}';`);
    }

    if (node.fills && node.fills.length > 0) {
      const fill = node.fills[0];
      L.push(`  ${name}.fills = [{ type: 'SOLID', color: { r: ${v(fill.color.r)}, g: ${v(fill.color.g)}, b: ${v(fill.color.b)} }${fill.opacity !== undefined ? `, opacity: ${v(fill.opacity)}` : ''} }];`);
    } else {
      L.push(`  ${name}.fills = [];`);
    }

    if (node.strokes && node.strokes.length > 0) {
      const s = node.strokes[0];
      L.push(`  ${name}.strokes = [{ type: 'SOLID', color: { r: ${v(s.color.r)}, g: ${v(s.color.g)}, b: ${v(s.color.b)} } }];`);
      if (node.strokeWeight) L.push(`  ${name}.strokeWeight = ${node.strokeWeight};`);
    }

    emitCornerRadius(name, node, L);
    if (node.opacity !== undefined) L.push(`  ${name}.opacity = ${v(node.opacity)};`);
    if (node.clipsContent) L.push(`  ${name}.clipsContent = true;`);
    if (node.effects && node.effects.length > 0) emitEffects(name, node.effects, L);

    // Append children and set their layout properties AFTER appendChild
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        const childVar = emitNode(child, ctx);
        L.push(`  ${name}.appendChild(${childVar});`);
        if (child.layoutGrow !== undefined) {
          L.push(`  ${childVar}.layoutGrow = ${child.layoutGrow};`);
        }
        if (child.layoutAlign) {
          L.push(`  ${childVar}.layoutAlign = '${child.layoutAlign}';`);
        }
      }
    }
  }

  return name;
}

// ── Public API ───────────────────────────────────────────

export function domToFigmaScript(doc: Document, width: number, height: number): string {
  const win = doc.defaultView;
  if (!win) return '// Error: no window';

  const root = walkDom(doc.body, win);
  if (!root) return '// Error: empty page';

  // Ensure root is a frame
  if (root.type !== 'FRAME') {
    const wrapper: FigmaNode = {
      type: 'FRAME',
      name: 'Page',
      w: width,
      h: height,
      layoutMode: 'VERTICAL',
      primaryAxisSizingMode: 'FIXED',
      counterAxisSizingMode: 'FIXED',
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
      children: [root],
    };
    return generateScript(wrapper);
  }

  root.w = width;
  root.name = 'Page';
  return generateScript(root);
}

function generateScript(root: FigmaNode): string {
  // Collect unique fonts
  const fontSet = new Set<string>();
  collectFonts(root, fontSet);
  fontSet.add('Inter:::Regular');

  // Font loading with robust fallback chain
  const fontLoads = Array.from(fontSet).map(f => {
    const [family, style] = f.split(':::');
    return `  await figma.loadFontAsync({ family: ${JSON.stringify(family)}, style: ${JSON.stringify(style)} })` +
      `.catch(() => figma.loadFontAsync({ family: ${JSON.stringify(family)}, style: 'Regular' })` +
      `.catch(() => figma.loadFontAsync({ family: 'Inter', style: ${JSON.stringify(style)} })` +
      `.catch(() => figma.loadFontAsync({ family: 'Inter', style: 'Regular' }))));`;
  });

  const ctx: ScriptCtx = { lines: [], counter: 0, hasImages: false };
  const rootVar = emitNode(root, ctx);

  return `// Auto-generated Figma Plugin script (v2)
// Run in Figma > Plugins > Scripter (free)
// Paste this entire script and press Run
//
// Features: Auto-layout, flex-wrap, layoutGrow, layoutAlign,
// box-shadow, per-corner radius, text-decoration, image loading

(async () => {
  // Load fonts
${fontLoads.join('\n')}

  // Build design tree
${ctx.lines.join('\n')}

  figma.currentPage.appendChild(${rootVar});
  figma.viewport.scrollAndZoomIntoView([${rootVar}]);
  figma.notify('Design imported with auto-layout!');
})();
`;
}

// Keep old export name for backward compatibility
export { domToFigmaScript as domToFigmaSvg };
