#!/usr/bin/env python3
"""Extract and validate the preserved TOEIC handbook using Python's standard library."""

from dataclasses import dataclass, field
from html import escape, unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "多益閱讀文法自學講義.html"
DESTINATION = ROOT / "data" / "handbook.mjs"


METADATA = {
    "intro": ("使用說明與總覽", "學習導航", "先了解閱讀三個部分，再用短診斷找出字彙、文法、閱讀速度的瓶頸。", 5,
              "先以正確率建立基礎，再縮短耗時。850+ 是總分目標，閱讀練習宜同時涵蓋文法、字彙與 Part 7；本 app 不以練習正確率換算正式分數。"),
    "ch1": ("詞性判斷", "句子骨架", "辨認名詞、形容詞、副詞與動詞的位置，搭配詞義排除同字根陷阱。", 8,
            "同字根題先定位空格功能；若留下兩個名詞或形容詞，必須回到整句的語意與搭配，不能只看字尾。"),
    "ch2": ("主詞動詞一致與句子結構", "句子骨架", "找真正主詞與限定動詞，拆開長修飾語，處理單複數及並列結構。", 8,
            "練習將長句標成主詞、限定動詞、修飾語。這也能加快 Part 7 的閱讀，尤其是插入關係子句的長主詞。"),
    "ch3": ("時態", "動詞變化", "用時間線與上下文判斷動作順序，時間詞是線索而非唯一答案。", 9,
            "不要把 since、for、by 當作自動選答案的按鈕。先建立現在、過去或未來的參照點，再看持續、完成與先後關係。"),
    "ch4": ("主動與被動語態", "動詞變化", "從動詞用法與主詞語意判斷語態，熟悉被動時態及雙受詞例外。", 8,
            "先確認動詞能否帶受詞，再判斷主詞是做動作還是承受動作。沒有受詞的 arrive、occur 仍可用主動。"),
    "ch5": ("不定詞與動名詞", "動詞變化", "掌握動詞搭配、目的用法與介系詞 to，避免只靠中文意思選形式。", 9,
            "將片語連同後面的形式一起記：enable someone to do、look forward to doing。遇到 stop、remember 等詞時比較兩種形式的語意。"),
    "ch6": ("分詞與分詞構句", "動詞變化", "判斷分詞與修飾對象的關係，區分後位修飾、情緒用法與省略子句。", 9,
            "先找句中限定動詞，再找分詞修飾哪個名詞。情緒形容詞看感受者與造成感受者，不能簡化成人或物。"),
    "ch7": ("假設語氣、原形動詞與倒裝", "動詞變化", "辨認條件倒裝、要求建議句型與否定倒裝，還原熟悉的句子語序。", 9,
            "遇到 Should you、Had we、Attached are，先還原為一般語序；建議要求句型也要先確認動詞是否表達要求，而非陳述事實。"),
    "ch8": ("代名詞", "名詞與修飾", "依句中功能與指涉對象，選擇格位、反身代名詞及比較替代詞。", 7,
            "先找代名詞代替的人或物，再檢查格位與單複數。Part 6、7 的 this、these、those 也需要回到上下文定位。"),
    "ch9": ("關係詞與形容詞子句", "名詞與修飾", "找先行詞及子句缺少的成分，分辨關係代名詞、關係副詞與 what。", 9,
            "先分清主句與關係子句，再檢查子句缺主詞、受詞還是地點時間成分。學完後把這個拆句方法用在 Part 7 長句。"),
    "ch10": ("比較級與最高級", "名詞與修飾", "處理比較級修飾詞、as…as、倍數與相關比較句型。", 7,
             "比較的不只是級別，還有比較對象是否一致。閱讀題要留意比率、排名、至少與至多等容易被改寫的資訊。"),
    "ch11": ("數量詞與限定詞", "名詞與修飾", "依名詞的可數性與數量語意選限定詞，掌握 each、all、few 與 little。", 8,
             "記住 equipment、information 等常用不可數用法，並搭配量詞記憶；單字可數性仍要依實際詞義判斷。"),
    "ch12": ("連接詞 vs 介系詞 vs 連接副詞", "連接與介系", "同時檢查句法、標點與前後邏輯，區分原因、讓步、條件及結果。", 9,
             "排除不合結構的選項後，仍須比較邏輯方向：because 引出原因，therefore 引出結果；前後兩句都要讀。"),
    "ch13": ("介系詞與商務搭配詞", "連接與介系", "分清截止時間與持續時間，連同商務詞組一起記憶介系詞。", 8,
             "把片語放回完整商務情境：by 是最晚期限，until 是持續終點。日期、退款期限與適用條件也是 Part 7 的細節考點。"),
    "ch14": ("Part 6 段落填空應用與文章題", "實戰演練", "利用整篇備忘錄處理詞性、連接邏輯、指涉與句子填空。", 8,
             "先掌握收件人、目的與時間線，再作答四個空格。句子填空要同時接上前句與後句，不能只匹配相同單字。"),
    "ch15": ("綜合模擬測驗", "實戰演練", "用混合題型確認觀念能否轉用到新句子，分開檢查正確率與速度。", 8,
             "先不限時取得穩定正確率，再以 6–8 分鐘完成 15 題作為練習目標。檢討時區分觀念錯誤、字彙不足與讀題疏漏。"),
    "appendix": ("速查總表與常考混淆詞", "複習工具", "快速複習核心句型、易混淆詞與語境中的同義改寫。", 5,
                 "同義詞並非任何位置都可互換。記錄文章原句與選項的整體改寫，核對搭配、語氣及時間條件是否一致。"),
}

# Corrections are applied only to extracted copies. The source HTML is never written.
REPLACEMENTS = {
    "intro": [
        ("約 60–70% 為文法題，其餘為字彙題", "涵蓋文法與字彙；本教材不宣稱固定出題比例"),
        ("<b>先看選項，不先看句子。</b>", "<b>先快速看選項，初步判斷題型，再核對句子。</b>"),
        ("字彙題（需靠單字量，不在本講義範圍）", "字彙與搭配題（本講義著重文法，另配合 app 的詞彙及閱讀練習）"),
        ("<b>只看空格前後 2–3 個字</b>，找出結構線索（冠詞、be 動詞、介系詞、受詞有無……）。", "<b>先看空格前後，找出結構線索</b>；仍無法確定時讀完整句，時態、語意與搭配題尤其需要上下文。"),
        ("<b>文法題目標每題 10–20 秒</b>", "<b>熟練後可將部分文法題以 10–20 秒為練習目標</b>"),
        ("建議 14 天學習進度", "原講義 14 天文法複習進度（可搭配 28 天路線）"),
        ("綜合模擬測驗（限時 12 分鐘）", "綜合模擬測驗（逐步練到 6–8 分鐘）"),
        ("例題點選答案後，會自動顯示對錯與<b>完整解析</b>", "練習模式作答後顯示對錯與<b>完整解析</b>；限時模式交卷後再檢討"),
        ("作答紀錄儲存在瀏覽器中，關掉網頁再打開也會保留；左側欄會顯示各章進度。", "作答紀錄儲存在目前瀏覽器；跨裝置時可透過 app 的匯出與匯入功能移轉紀錄。"),
        ("想重新練習，可按左側「清除全部作答紀錄」。列印時會自動展開全部解析。", "錯題可再次練習；保留首次作答紀錄，才能分辨初次掌握與複習進步。時間配置為練習建議，正式閱讀測驗共 75 分鐘。"),
    ],
    "ch1": [
        ("Part 5 出題率最高的題型", "辨識句子成分與常見詞形"),
        ("詞性題不需要翻譯整句。英文句子的每個位置只能坐特定詞性，看空格前後就能決定。", "詞性題可先從空格的句法功能縮小選項；名詞修飾、分詞與同詞性選項仍可能需要整句語意。不要只靠字尾或空格旁的一個字決定答案。"),
        ("例如 submit 的對象只能是「申請書」", "例如本題 submit applications 表示「提交申請書」"),
        ("人不能被「提交」", "本句需要提交的文件名稱，而非申請人的名稱"),
        ("可數單數名詞前面一定要有限定詞", "一般單數可數名詞片語通常需要限定詞"),
        ("冠詞／所有格／形容詞之後 → 名詞", "冠詞／所有格引出名詞片語；中間可能有形容詞或名詞修飾語，須辨認整個片語"),
        ("助動詞與動詞之間、be 與 p.p. 之間、形容詞與比較級之前、完整句子的句尾 → 副詞", "需修飾動作或整句時可選副詞；助動詞與動詞之間、be 與 p.p. 之間及形容詞前是常見位置，仍須確認句中功能，不能只因空格在句尾就選副詞"),
    ],
    "ch2": [
        ("鐵則一：一個子句只能有一個「主要動詞」", "先找限定動詞；並列謂語可由 and／or／but 連接"),
        ("鐵則二：已有主要動詞 → 空格要選非限定動詞", "若同一子句已有完整謂語，且空格不是並列謂語，再檢查非限定形式"),
        ("句子已有動詞 → 選 to V / V-ing / p.p.；缺動詞 → 選限定動詞", "先定位空格所在子句；缺謂語時選限定動詞。已有謂語時，仍須檢查並列結構、關係子句或非限定修飾語。"),
    ],
    "ch3": [
        ("抓「時間線索」就能秒選", "時間線索要配合上下文"),
        ("<code>ago</code> 只能搭過去式", "<code>ago</code> 通常指過去時間，搭配相應的過去時態"),
        ("過去式不能表示規律", "過去式可表示過去的規律，但本句是在描述現行接駁班次"),
        ("since / for / over the past / so far → 現在完成式", "since / for / over the past / so far 常提示完成式；仍須確認參照時間，for 也可搭過去式等時態"),
        ("by the time + 過去式 → 過去完成式；by + 未來時間 → 未來完成式", "描述較早於另一過去動作時，常用過去完成式；by + 未來時間可搭 will V 或 will have p.p.，依是否強調屆時已完成判斷"),
    ],
    "ch4": [
        ("看「空格後面有沒有受詞」", "先看動詞用法與主詞語意"),
        ("<b>看空格後面有沒有受詞（名詞）</b>：有受詞 → 主動；沒有受詞（接介系詞、副詞或句點）→ 多半是被動。", "<b>先確認動詞的及物性與句型</b>：受詞是線索，不能單獨決定語態；不及物動詞如 arrive、occur 不帶受詞，仍使用主動。"),
        ("空格後有受詞 → 主動；沒有受詞 → 被動（授與動詞例外）", "先判斷主詞與動作的關係，再核對及物性與受詞；無受詞不代表被動，雙受詞動詞的被動後也可能保留受詞。"),
        ("沒有受詞，所以用被動", "且 reports 是 submit 的承受者，因此用被動"),
        ("(A) presented", "(A) awarded"),
        ("(B) was presented", "(B) was awarded"),
        ("(C) presenting", "(C) awarding"),
        ("(D) has presented", "(D) has awarded"),
        ("present 是授與動詞，be presented + 獎項 = 獲頒某獎", "award 可接兩個受詞，be awarded + 獎項 = 獲頒某獎"),
    ],
    "ch5": [
        ("介系詞後面只能接名詞或動名詞", "介系詞常接名詞片語、代名詞或 V-ing 形式"),
        ("原形只能接在使役動詞 make / let / have 後面", "本句 enable + 受詞 後需接 to V，不能直接接原形"),
        ("<code>suggest / recommend</code> 不能接 <code>人 + to V</code>", "<code>suggest / recommend</code> 的常用建議句型是 <code>V-ing</code> 或 <code>that 子句</code>"),
    ],
    "ch6": [
        ("情緒動詞：修飾<b>人</b>多用 p.p.（interested, satisfied, impressed）；修飾<b>事物</b>多用 V-ing（interesting, satisfying, impressive）。", "情緒形容詞：感受者常用 p.p.（interested, satisfied, impressed）；造成感受者常用 V-ing（interesting, satisfying, exciting）。人也可以是 an interesting speaker。impressive 是一般形容詞，可形容人或物。"),
        ("不及物動詞只有 V-ing 的主動修飾：remaining, existing, rising, emerging, lasting。", "remaining、existing、rising、emerging、lasting 常作主動修飾；部分不及物動詞也有表完成狀態的 p.p.，如 fallen leaves、retired employees，須依詞義判斷。"),
        ("<li data-k=\"B\">(B) qualifying</li>", "<li data-k=\"B\">(B) qualifies</li>"),
        ("qualifying 用於 qualifying exam（資格考）這類搭配，不修飾人", "qualifies 是第三人稱單數限定動詞，不能直接放在 candidates 前作修飾語；本句需用形容詞 qualified 表示具備資格的"),
        ("impressive 形容事物，且不接 by", "impressive 可形容人或物，但不符合本句「be deeply impressed by」的感受者句型"),
    ],
    "ch7": [
        ("that 子句的動詞一律用原形", "表達建議、要求或必要性時，that 子句常用原形虛擬式"),
        ("Unless = 除非不", "Unless = 除非／if ... not"),
    ],
    "ch8": [
        ("主格不能放句尾", "she 無法在本句作 review 的受詞或強調成分"),
        ("these 不接 who 子句", "此處泛指符合條件的人，慣用 those who；these 通常指近處或剛提到的特定對象"),
        ("them 不能被關係子句修飾", "本句需要 those who 構成「符合條件的人」這個名詞片語"),
        ("other 不能單獨當代名詞", "此處指特定兩間辦公室中的另一間，需用 the other"),
        ("another 用於三者以上中的「另一個」", "another 指額外或不特定的另一個；此處已限定為兩間辦公室"),
        ("句子完整、句尾空格 → 反身代名詞（強調）", "需強調主詞親自執行時，選與主詞對應的反身代名詞；句末也可能接副詞等其他成分，須先判斷空格的功能"),
    ],
    "ch9": [
        ("所有格（接名詞、子句完整）", "所有格（whose + 名詞，整組在子句中作成分）"),
        ("空格後有名詞 + 完整子句（表「某人的……」）", "空格後有名詞，且 whose + 名詞整組在子句中作主詞或受詞（表所有關係）"),
        ("介系詞後只能用 whom 或 which", "前置介系詞後的關係代名詞通常用 whom 或 which"),
        ("工作坊將於第三會議室舉行", "工作坊將於 B 會議室舉行"),
        ("where 前面不能直接加介系詞 from", "本句 vendor 是提供報價的廠商，需 from which；from where 可出現在描述地點的其他句型"),
        ("that 前方禁忌：絕不可有「逗號」、絕不可有「介系詞」", "作關係代名詞的 that 不用於非限定關係子句，也不能直接接在前置介系詞後；此規則不涵蓋其他 that 用法"),
    ],
    "ch10": [
        ("very 絕對不能修飾比較級！", "比較級前通常用 much／far 等，不直接用 very！"),
        ("very 只能修飾原級", "此處 very 用於原級；very 也可出現在 the very best 等特定結構"),
        ("都只能修飾「原級形容詞/副詞」，絕對不能修飾比較級", "在本句不能直接放在 more efficient 前；比較級常用 significantly、much 等修飾"),
        ("（絕不用 very）", "（不直接用 very faster／very more expensive）"),
        ("唯一最重要的因素", "最為重要的單一因素"),
        ("今年唯一最重要的一場簡報", "今年最為重要的一場簡報"),
    ],
    "ch11": [
        ("多益「必考不可數名詞」清單（絕不可加 -s，絕不加 a/an）", "常見不可數用法清單（以下詞義通常不加 -s 或 a/an）"),
        ("都必須接「複數可數名詞」（All applicants...）", "在此修飾 applicant 時須改成複數 applicants；all 另可修飾不可數名詞"),
        ("a substantial <span class=\"blank\">___</span> of data on consumer behavior", "a substantial <span class=\"blank\">___</span> of information on consumer behavior"),
        ("<code>data</code> 在商業英語中常視為不可數名詞集合體", "<code>information</code>（資訊）在本句是不可數名詞"),
        ("研究部門已收集了大量關於消費者行為的數據", "研究部門已收集了大量關於消費者行為的資訊"),
    ],
    "ch12": [
        ("多益失分率最高的陷阱題", "從結構與上下文判斷連接方式"),
        ("介系詞後面絕不能直接接有主詞動詞的完整子句。", "常見介系詞多接名詞片語或 V-ing；也可能接 what 等名詞性子句。before、since、until 等接子句時，傳統教學歸為連接詞用法。"),
        ("<b>先數句子裡有幾個動詞</b>：如果有兩個動詞且沒有其他連接詞，空格<b>必定要填「連接詞」</b>。", "<b>先找限定動詞並劃分子句</b>：V-ing、p.p.、to V 不等於另一個限定子句；再檢查是否需要並列或從屬連接成分。"),
        ("since 是連接詞，後面必須接完整的子句 (S + V)", "since 在因果用法中引導子句；時間用法也可作介系詞，但本句需要表達技術故障的原因"),
        ("<li data-k=\"B\">(B) while</li><li data-k=\"C\">(C) before</li>", "<li data-k=\"B\">(B) despite</li><li data-k=\"C\">(C) before</li>"),
        ("(B) while leaving 表示「正在離開的當下」，語意不如 before 自然", "(B) despite 表示「儘管」，無法表達關螢幕與離開辦公室的時間先後"),
        ("<li data-k=\"C\">(C) except</li><li data-k=\"D\">(D) instead of</li>", "<li data-k=\"C\">(C) except for</li><li data-k=\"D\">(D) instead of</li>"),
        ("(C) except、(D) instead of", "(C) except for、(D) instead of"),
    ],
    "ch13": [
        ("Previous 是純形容詞，不接 to", "previous 在此不是標準選擇；本句使用固定片語 prior to"),
        ("prevent / prohibit from", "prevent / prohibit someone from"),
    ],
    "ch14": [
        ("這 4 題的考點分佈非常規律：", "各篇實際考點可能不同；下表說明本篇自編題組的示範配置，不代表正式測驗每篇固定比例："),
        ("<th>每篇題數</th>", "<th>本篇示範題數</th>"),
        ("</b>（詞性、時態、語態）</td><td>1–2 題</td>", "</b>（詞性、時態、語態）</td><td>2 題</td>"),
        ("<b>商務字彙題</b></td><td>1 題</td>", "<b>商務字彙題</b></td><td>0 題，另配合補充題組</td>"),
        ("<b>轉折連接詞題</b></td><td>0–1 題</td>", "<b>轉折連接詞題</b></td><td>1 題</td>"),
        ("<td>固定 1 題</td>", "<td>1 題</td>"),
        ("將在週末前發放給各部門", "將在本週結束前發放給各部門"),
        ("Part 6 絕不逐字精讀，遇到文法題（詞性/語態）當句秒殺", "Part 6 先掌握文章目的與時間線；結構明確的文法題可先作答，語意與連貫題須讀前後文"),
        ("時態題一定要參考「相鄰句」的動詞時態基準", "時態題參考相鄰句及整篇的時間基準，不要假設所有句子時態必須相同"),
    ],
    "ch15": [
        ("建議限時：8–10 分鐘", "練習建議：先不限時，再逐步練到 6–8 分鐘"),
        ("all newly joined partners", "all new partners"),
        ("quieter than the previous model", "more quietly than the previous model"),
        ("比較級 <code>quieter</code>", "比較級副詞片語 <code>more quietly</code>"),
        ("均只能修飾原級，絕不可修飾比較級", "在本句不能直接修飾 more quietly，需用 much 等比較級修飾詞"),
    ],
    "appendix": [
        ("20 組商務同義詞置換清單", "10 組商務同義詞置換清單"),
    ],
}

VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
SKIP_TAGS = {"script", "style", "iframe", "object", "embed"}


@dataclass
class Element:
    tag: str
    attrs: dict = field(default_factory=dict)
    children: list = field(default_factory=list)

    def has_class(self, value):
        return value in self.attrs.get("class", "").split()

    def descendants(self, predicate):
        found = []
        for child in self.children:
            if isinstance(child, Element):
                if predicate(child):
                    found.append(child)
                found.extend(child.descendants(predicate))
        return found

    def first(self, predicate):
        return next(iter(self.descendants(predicate)), None)

    def inner_html(self, exclude=None):
        return "".join(child.render(exclude) if isinstance(child, Element) else child for child in self.children)

    def render(self, exclude=None):
        if self.tag in SKIP_TAGS or (exclude and exclude(self)):
            return ""
        if not self.tag:
            return self.inner_html(exclude)
        safe_attrs = []
        for key, value in self.attrs.items():
            if key.lower().startswith("on"):
                continue
            if key.lower() in {"href", "src"} and re.match(r"\s*(?:javascript|vbscript):", value, re.I):
                continue
            safe_attrs.append(f' {key}="{escape(value, quote=True)}"')
        opening = f"<{self.tag}{''.join(safe_attrs)}>"
        return opening if self.tag in VOID_TAGS else opening + self.inner_html(exclude) + f"</{self.tag}>"

    def text(self):
        return unescape(re.sub(r"<[^>]+>", " ", self.inner_html())).strip()


class DocumentParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.root = Element("")
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        element = Element(tag, {key: value or "" for key, value in attrs})
        self.stack[-1].children.append(element)
        if tag not in VOID_TAGS:
            self.stack.append(element)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)

    def handle_entityref(self, name):
        self.handle_data(f"&{name};")

    def handle_charref(self, name):
        self.handle_data(f"&#{name};")


def parse(source):
    parser = DocumentParser()
    parser.feed(source)
    return parser.root


def correct_section(section):
    section_id = section.attrs["id"]
    markup = section.render()
    for before, after in REPLACEMENTS.get(section_id, []):
        if before not in markup:
            raise ValueError(f"Correction anchor missing in {section_id}: {before}")
        markup = markup.replace(before, after)
    markup = markup.replace("必考", "常見重點").replace("全真", "自編").replace("秒殺", "快速判斷")
    corrected = parse(markup).first(lambda node: node.tag == "section")
    # Unsupported numerical frequency claims are replaced by the actual chapter topic.
    for tag in corrected.descendants(lambda node: node.has_class("f")):
        if "出題頻率" in tag.text():
            tag.children = ["練習重點：" + escape(METADATA[section_id][0])]
    return corrected


def extract_handbook(source):
    document = parse(source)
    chapters, questions = [], []
    for original in document.descendants(lambda node: node.tag == "section" and node.has_class("chapter")):
        section = correct_section(original)
        chapter_id = section.attrs["id"]
        title, group, summary, minutes, strategy = METADATA[chapter_id]
        subtitle_element = section.first(lambda node: node.has_class("ch-sub"))
        passage_element = section.first(lambda node: node.has_class("passage"))
        passage = passage_element.render().strip() if passage_element else ""
        question_ids = []
        for quiz in section.descendants(lambda node: node.has_class("quiz")):
            question_id = quiz.attrs.get("data-qid", f"q_{len(questions)}")
            stem_element = quiz.first(lambda node: node.has_class("q"))
            options_element = quiz.first(lambda node: node.has_class("opts"))
            explanation_element = quiz.first(lambda node: node.has_class("expl"))
            options = [re.sub(r"^\s*\([A-D]\)\s*", "", option.inner_html()).strip()
                       for option in options_element.children if isinstance(option, Element) and option.tag == "li"]
            stem = stem_element.inner_html(lambda node: node.has_class("qn")).strip()
            part = 6 if chapter_id == "ch14" else 5
            if part == 6:
                blank_number = len(question_ids) + 1
                stem = f"請選擇最適合填入文章空格 <b>{blank_number}</b> 的{'完整句子' if blank_number == 3 else '選項'}。"
            questions.append({
                "id": question_id, "chapter": chapter_id, "part": part,
                "stem": stem, "options": options, "answer": ord(quiz.attrs["data-ans"]) - ord("A"),
                "explanation": explanation_element.inner_html().strip(), "passage": passage,
                "passageTitle": "內部備忘錄｜新 CRM 平台導入" if passage else "",
                "setId": "ch14" if part == 6 else "",
            })
            question_ids.append(question_id)
        strategy_html = f'<div class="callout tip"><b>850+ 讀法練習</b><p>{escape(strategy)}</p></div>'
        if chapter_id == "intro":
            strategy_html += '<p>正式測驗格式：閱讀 100 題、75 分鐘，Part 5／6／7 分別為 30／16／54 題。參考 <a href="https://www.ets.org/pdfs/toeic/toeic-listening-reading-test-examinee-handbook.pdf" target="_blank" rel="noopener noreferrer">ETS 官方考生手冊</a>。本 app 的題目為學習練習，時間配置為建議。</p>'
        lesson_html = section.inner_html(lambda node: node.has_class("quiz")).strip()
        chapters.append({
            "id": chapter_id, "title": title,
            "subtitle": subtitle_element.text() if subtitle_element else "",
            "group": group, "summary": summary, "minutes": minutes,
            "html": strategy_html + "\n" + lesson_html, "questionIds": question_ids,
        })
    return chapters, questions


def validate(chapters, questions):
    expected_chapters = ["intro"] + [f"ch{index}" for index in range(1, 16)] + ["appendix"]
    assert [chapter["id"] for chapter in chapters] == expected_chapters, "All 17 sections must be preserved in source order"
    assert [question["id"] for question in questions] == [f"q_{index}" for index in range(97)], "Original IDs q_0 to q_96 must remain stable"
    assert len({q["id"] for q in questions}) == len(questions), "Duplicate question ID"
    chapter_ids = set(expected_chapters)
    required = {"id", "chapter", "part", "stem", "options", "answer", "explanation", "passage", "passageTitle", "setId"}
    for question in questions:
        assert set(question) == required, f"Question schema mismatch: {question['id']}"
        assert question["chapter"] in chapter_ids
        assert question["part"] in {5, 6}
        assert len(question["options"]) == 4 and all(isinstance(option, str) and option.strip() for option in question["options"])
        assert type(question["answer"]) is int and 0 <= question["answer"] <= 3
        assert question["stem"].strip() and question["explanation"].strip()
        text_fields = [question["stem"], question["explanation"], question["passage"], *question["options"]]
        assert not any(re.search(r"<script\b|<[^>]+\son\w+\s*=", value, re.I) for value in text_fields), f"Unsafe markup in {question['id']}"
        answer_letter = chr(ord("A") + question["answer"])
        assert re.search(rf"正解：\({answer_letter}\)", question["explanation"]), f"Explanation answer drift: {question['id']}"
    for chapter in chapters:
        assert chapter["questionIds"] == [q["id"] for q in questions if q["chapter"] == chapter["id"]]
        assert 'class="quiz"' not in chapter["html"]
        assert not re.search(r"<script\b|<[^>]+\son\w+\s*=", chapter["html"], re.I)
    reading = [q for q in questions if q["part"] == 6]
    assert len(reading) == 4 and {q["setId"] for q in reading} == {"ch14"}
    assert len({q["passage"] for q in reading}) == 1 and all(q["passage"] for q in reading)
    return {"chapters": len(chapters), "lessons": 15, "questions": len(questions), "part5": 93, "part6": len(reading), "readingSets": 1}


def write_module(chapters, questions):
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    content = "// Generated by scripts/extract-handbook.py. Original HTML is preserved.\n"
    content += "// Question IDs match the original browser's data-qid values.\n"
    content += "export const chapters = " + json.dumps(chapters, ensure_ascii=False, indent=2) + ";\n\n"
    content += "export const questions = " + json.dumps(questions, ensure_ascii=False, indent=2) + ";\n"
    DESTINATION.write_text(content, encoding="utf-8", newline="\n")


class ExtractionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.chapters, cls.questions = extract_handbook(SOURCE.read_text(encoding="utf-8"))

    def test_preserves_original_questions_and_answer_identity(self):
        self.assertEqual(len(self.chapters), 17)
        self.assertEqual(len(self.questions), 97)
        self.assertEqual(self.questions[0]["id"], "q_0")
        self.assertEqual(self.questions[0]["answer"], 1)
        self.assertIn("Ms. Tanaka", self.questions[0]["stem"])
        self.assertEqual(self.questions[-1]["id"], "q_96")
        self.assertEqual(self.questions[-1]["answer"], 1)

    def test_part_six_questions_keep_the_shared_passage(self):
        reading = [q for q in self.questions if q["part"] == 6]
        self.assertEqual([q["id"] for q in reading], ["q_78", "q_79", "q_80", "q_81"])
        self.assertEqual({q["setId"] for q in reading}, {"ch14"})
        self.assertEqual(len({q["passage"] for q in reading}), 1)
        self.assertTrue(all("Apex" in q["passage"] for q in reading))

    def test_lessons_and_stems_do_not_duplicate_quiz_controls(self):
        self.assertTrue(self.chapters)
        self.assertTrue(all('class="quiz"' not in c["html"] for c in self.chapters))
        self.assertTrue(all('class="qn"' not in q["stem"] for q in self.questions))
        self.assertTrue(all(len(q["options"]) == 4 for q in self.questions))
        self.assertTrue(all(not q["options"][0].startswith("(A)") for q in self.questions))

    def test_embedded_markup_cannot_keep_scripts_or_click_handlers(self):
        sample = SOURCE.read_text(encoding="utf-8").replace(
            '<section id="intro" class="chapter">',
            '<section id="intro" class="chapter"><p onclick="steal()">Safe text</p><script>alert(1)</script>',
        )
        chapters, _ = extract_handbook(sample)
        self.assertIn("Safe text", chapters[0]["html"])
        self.assertNotIn("onclick", chapters[0]["html"])
        self.assertNotIn("alert(1)", chapters[0]["html"])

    def test_question_corrections_keep_answer_letters_consistent(self):
        by_id = {q["id"]: q for q in self.questions}
        self.assertEqual(by_id["q_70"]["options"][1], "despite")
        self.assertEqual(by_id["q_70"]["answer"], 2)
        self.assertIn("more quietly", by_id["q_92"]["stem"])
        self.assertIn("B 會議室", by_id["q_50"]["explanation"])

    def test_double_object_passive_example_keeps_the_retained_object(self):
        question = next(q for q in self.questions if q["id"] == "q_22")
        self.assertEqual(question["options"][1], "was awarded")
        self.assertIn('___</span> the Employee', question["stem"])
        self.assertIn("award 可接兩個受詞", question["explanation"])

    def test_qualified_question_has_only_one_adjectival_option(self):
        question = next(q for q in self.questions if q["id"] == "q_31")
        self.assertEqual(question["options"], ["qualify", "qualifies", "qualified", "qualification"])
        self.assertEqual(question["answer"], 2)
        self.assertIn("限定動詞", question["explanation"])
        self.assertIn("正解：(C) qualified", question["explanation"])

    def test_sentence_end_rules_require_the_intended_function(self):
        by_id = {chapter["id"]: chapter for chapter in self.chapters}
        self.assertNotIn("完整句子的句尾 → 副詞", by_id["ch1"]["html"])
        self.assertNotIn("句子完整、句尾空格 → 反身代名詞", by_id["ch8"]["html"])
        self.assertIn("需修飾動作或整句時", by_id["ch1"]["html"])
        self.assertIn("需強調主詞親自執行時", by_id["ch8"]["html"])

    def test_all_records_satisfy_the_consumer_schema(self):
        self.assertEqual(validate(self.chapters, self.questions)["questions"], 97)


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        unittest.main(argv=[sys.argv[0]], verbosity=2)
    else:
        extracted_chapters, extracted_questions = extract_handbook(SOURCE.read_text(encoding="utf-8"))
        result = validate(extracted_chapters, extracted_questions)
        write_module(extracted_chapters, extracted_questions)
        print(json.dumps(result, ensure_ascii=False))
