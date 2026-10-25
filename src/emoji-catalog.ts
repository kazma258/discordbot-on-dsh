export interface ApplicationEmojiNote {
  readonly id: string;
  readonly name: string;
  readonly localNote: string;
  readonly usage: string;
}

/**
 * Stable, local descriptions for application-owned emojis. These notes are
 * prompt metadata; the bridge still resolves the actual ID from Discord.
 */
export const APPLICATION_EMOJI_NOTES: readonly ApplicationEmojiNote[] = [
  {
    id: '1563794191023210576',
    name: 'silly_tilt',
    localNote:
      '鯨魚娘以Q版娃娃造型大幅歪頭，張嘴露出呆萌又搞怪的表情，身體也跟著傾斜。整體情緒活潑、裝傻、耍寶，帶有故意賣萌和鬧人的感覺。',
    usage:
      '適合回覆奇怪發言、故意裝傻、賣萌、鬧人，或表達「欸嘿」「我什麼都不知道」「你看我幹嘛」等輕鬆搞怪語境。'
  },
  {
    id: '1563794188854890619',
    name: 'chill',
    localNote:
      '鯨魚娘閉著雙眼，臉頰微紅，嘴角呈現平靜滿足的小笑容，雙手自然放在身前。整體感覺安逸、從容、自我陶醉，有種完全不在意外界的悠閒感。',
    usage:
      '適合表達舒服、滿足、歲月靜好、事情順利，或面對混亂時仍保持淡定，也可帶一點「我很滿意」的自得感。'
  },
  {
    id: '1563794185335611493',
    name: 'popcorn',
    localNote:
      '鯨魚娘穿著女僕裝，雙手抱著一大塊西瓜，睜大閃亮眼睛並開心張嘴，表情非常興奮期待。畫面可愛歡樂，也自然帶出圍觀、看戲、吃瓜的意味。',
    usage:
      '適合看到八卦、爭論、突發事件時表示圍觀，也能用於「快講，我在聽」「讓我看看發生什麼事」等期待看戲的語境。'
  },
  {
    id: '1563794181955129435',
    name: 'tough_maid',
    localNote:
      '鯨魚娘被畫成極度陽剛強壯的漫畫硬漢，五官稜角分明、眼神銳利、表情嚴肅，搭配女僕裝形成強烈反差，帶有壓迫感與荒謬喜感。',
    usage:
      '適合表達突然變得很硬派、認真、充滿殺氣或氣勢，也可用於反差梗，例如「這件事我認真了」「準備動真格」。'
  },
  {
    id: '1563794179992322089',
    name: 'stare',
    localNote:
      '鯨魚娘的臉以超近距離佔滿畫面，雙眼直視前方，嘴巴幾乎沒有表情。因鏡頭距離異常近而產生強烈凝視感，情緒偏沉默、疑惑、無語又略帶壓迫。',
    usage:
      '適合看到奇怪言論後沉默盯人、等待對方解釋、表示「你認真的嗎」，或刻意靠近觀察某件可疑事情。'
  },
  {
    id: '1563794178125733958',
    name: 'work_tired',
    localNote:
      '鯨魚娘穿著女僕裝坐在電腦桌前，雙眼半睜、眼神死氣沉沉，面前放著鍵盤與螢幕，旁邊還有咖啡。整體充滿疲憊、麻木、加班與不想工作的感覺。',
    usage:
      '適合上班、加班、寫程式、處理工作或熬夜時使用，表達「好累」「不想動」「又要上班了」「靠咖啡續命」等厭世狀態。'
  },
  {
    id: '1563794176162660412',
    name: 'smug',
    localNote:
      '鯨魚娘的大臉近景，眼睛圓睜，眉毛微微向內挑起，嘴角形成細小而微妙的笑容。看起來既無辜又略帶得意，有種知道些什麼但故意不說的感覺。',
    usage:
      '適合小小得意、偷偷炫耀、計畫成功、故作無辜，或用來表示「嘿嘿」「我就知道」「一切都在計畫中」等語境。'
  }
];
