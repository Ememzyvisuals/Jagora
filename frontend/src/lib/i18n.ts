/* What Jagora says, in five languages. Yorùbá and Pidgin are written by a native speaker's standards;
   Hausa and Igbo lines should get a native speaker's review before launch. Numbers stay as digits. */

export type Lang = "en" | "pcm" | "yo" | "ha" | "ig";

export const LANGS: { id: Lang; name: string; native: string; hello: string }[] = [
  { id: "yo", name: "Yoruba", native: "Yorùbá", hello: "Ẹ káàbọ̀" },
  { id: "ha", name: "Hausa", native: "Hausa", hello: "Barka da zuwa" },
  { id: "ig", name: "Igbo", native: "Igbo", hello: "Nnọọ" },
  { id: "pcm", name: "Pidgin", native: "Naijá", hello: "How far" },
  { id: "en", name: "English", native: "English", hello: "Welcome" },
];

type Lines = Record<Lang, string>;
const L = (en: string, pcm: string, yo: string, ha: string, ig: string): Lines => ({ en, pcm, yo, ha, ig });

export const T = {
  greet: L("Good day", "How you dey", "Ẹ n lẹ́", "Sannu", "Ndeewo"),
  ask: L("Tell Jagora what you want to do", "Tell Jagora wetin you wan do", "Sọ ohun tí ẹ fẹ́ ṣe fún Jagora", "Faɗa wa Jagora abin da kake so", "Gwa Jagora ihe ị chọrọ ime"),
  listening: L("Listening", "I dey hear you", "Mo ń gbọ́ yín", "Ina sauraro", "Ana m ege ntị"),
  thinking: L("Looking at the page", "I dey look the page", "Mo ń wo ojú ìwé náà", "Ina duba shafin", "Ana m ele ibe a"),
  speaking: L("Speaking", "I dey talk", "Mo ń sọ̀rọ̀", "Ina magana", "Ana m ekwu okwu"),
  idle: L("Tap to talk", "Tap make you talk", "Tẹ̀ ẹ́ láti sọ̀rọ̀", "Taɓa don yin magana", "Pịa ka ị kwuo okwu"),
  yes: L("Yes", "Yes", "Bẹ́ẹ̀ ni", "Eh", "Ee"),
  no: L("No", "No", "Rárá", "A'a", "Mba"),
  done: L("Done", "E don do", "Ó ti parí", "An gama", "Emechaala"),
  typeHere: L("Type a message", "Type message", "Kọ ọ̀rọ̀ síbí", "Rubuta saƙo", "Dee ozi ebe a"),
  guide: L("Guide me", "Show me", "Fi hàn mí", "Nuna mini", "Gosi m"),
  doIt: L("Do it for me", "Do am for me", "Ṣe é fún mi", "Yi mini", "Mee ya maka m"),
  // the agent's own lines in the demo
  opening: L("I'm opening the registration page.", "I dey open the registration page.", "Mo ń ṣí ojú ìwé ìforúkọsílẹ̀.", "Ina buɗe shafin rajista.", "Ana m emepe ibe ndebanye aha."),
  closingNotice: L("There's a notice in the way. I'll close it.", "One notice dey block am. I go close am.", "Ìkéde kan dí i. Màá pa á dé.", "Akwai sanarwa a gaba. Zan rufe shi.", "Ozi dị n'ụzọ. Aga m emechi ya."),
  filling: L("I'm filling in your details from your profile.", "I dey fill your details from your profile.", "Mo ń kọ àwọn àlàyé yín láti inú àkọsílẹ̀ yín.", "Ina cike bayananka daga bayanan ka.", "Ana m ejupụta nkọwa gị site na profaịlụ gị."),
  whichSkill: L("Which skill do you want to learn?", "Which skill you wan learn?", "Iṣẹ́ wo ni ẹ fẹ́ kọ́?", "Wace sana'a kake son koya?", "Kedu nka ị chọrọ ịmụta?"),
  agreeAsk: L("The form asks if they can contact you about this. Should I agree?", "The form dey ask if dem fit contact you. Make I agree?", "Fọ́ọ̀mù náà ń béèrè bóyá wọ́n lè kàn sí yín. Ṣé kí n gbà?", "Fom ɗin yana tambaya ko za su iya tuntuɓarka. In amince?", "Fọm a na-ajụ ma ha nwere ike ịkpọtụrụ gị. Ka m kwenye?"),
  submitAsk: L("Everything is filled in. Should I submit the form now?", "Everything don complete. Make I submit the form now?", "Mo ti kọ gbogbo rẹ̀. Ṣé kí n fi fọ́ọ̀mù náà ránṣẹ́ báyìí?", "Na cike komai. In tura fom ɗin yanzu?", "Ejupụtala m ihe niile. Ka m zipu fọm a ugbu a?"),
  stoppedNo: L("Okay, I won't do that. Tell me what you'd like instead.", "Okay, I no go do am. Tell me wetin you want.", "Ó dáa, mi ò ní ṣe é. Ẹ sọ ohun tí ẹ fẹ́ fún mi.", "To, ba zan yi ba. Faɗa mini abin da kake so.", "Ọ dị mma, agaghị m eme ya. Gwa m ihe ị chọrọ."),
  registered: L("You're registered. Your reference number is {ref}. Keep it for the training day.", "You don register. Your reference number na {ref}. Keep am for the training day.", "Ẹ ti forúkọsílẹ̀. Nọ́mbà ìtọ́kasí yín ni {ref}. Ẹ tọ́jú rẹ̀ fún ọjọ́ ẹ̀kọ́.", "An yi maka rajista. Lambar shaidarka ita ce {ref}. Ka ajiye ta don ranar horo.", "Edebanyela aha gị. Nọmba ntụaka gị bụ {ref}. Debe ya maka ụbọchị ọzụzụ."),
  guideIntro: L("I'll show you each step. Tap where I point.", "I go show you each step. Tap where I point.", "Màá fi ìgbésẹ̀ kọ̀ọ̀kan hàn yín. Ẹ tẹ ibi tí mo bá tọ́ka sí.", "Zan nuna maka kowane mataki. Ka taɓa inda na nuna.", "Aga m egosi gị nzọụkwụ ọ bụla. Pịa ebe m na-egosi."),
  pointName: L("This box is for your full name. Tap it and I'll fill it.", "This box na for your full name. Tap am, I go fill am.", "Àpótí yìí wà fún orúkọ yín ní kíkún. Ẹ tẹ̀ ẹ́, màá kọ ọ́.", "Wannan akwatin don cikakken sunanka ne. Taɓa shi zan cike.", "Igbe a bụ maka aha gị zuru ezu. Pịa ya, m ga-ejupụta ya."),
  checking: L("Let me check this message.", "Make I check this message.", "Ẹ jẹ́ kí n yẹ ọ̀rọ̀ yìí wò.", "Bari in duba wannan saƙo.", "Ka m lelee ozi a."),
  scam: L("This looks like a scam. Don't click the link and don't share your PIN, BVN or OTP.", "This one na scam. No click the link, no give anybody your PIN, BVN or OTP.", "Èyí dà bí jìbìtì. Ẹ má tẹ ìsopọ̀ náà, ẹ má sì fún ẹnikẹ́ni ní PIN, BVN tàbí OTP yín.", "Wannan kamar zamba ne. Kada ka danna mahaɗin, kuma kada ka bayar da PIN, BVN ko OTP.", "Nke a dị ka aghụghọ. Apịala njikọ ahụ, enyekwala onye ọ bụla PIN, BVN ma ọ bụ OTP gị."),
  safe: L("I don't see warning signs, but never share your PIN or OTP with anyone.", "I no see any wahala sign, but no ever give anybody your PIN or OTP.", "Mi ò rí àmì ewu, ṣùgbọ́n ẹ má ṣe fún ẹnikẹ́ni ní PIN tàbí OTP yín.", "Ban ga alamar haɗari ba, amma kada ka taɓa ba kowa PIN ko OTP.", "Ahụghị m ihe egwu, mana enyela onye ọ bụla PIN ma ọ bụ OTP gị."),
  unsure: L("I'm not sure about this one. Check with your bank directly before you do anything.", "I no too sure. Call your bank first before you do anything.", "Mi ò dá a lójú. Ẹ kàn sí báǹkì yín tààrà kí ẹ tó ṣe ohunkóhun.", "Ban da tabbas. Ka tuntuɓi bankinka kai tsaye kafin ka yi komai.", "O doghị m anya. Kpọtụrụ ụlọ akụ gị ozugbo tupu i mee ihe ọ bụla."),
  explaining: L("Let me read this paper for you.", "Make I read this paper for you.", "Ẹ jẹ́ kí n ka ìwé yìí fún yín.", "Bari in karanta maka wannan takarda.", "Ka m gụọrọ gị akwụkwọ a."),
  needServer: L("I need to be connected to understand your own photo. Try the sample letter for now.", "I need connection to read your own photo. Try the sample letter for now.", "Mo nílò ìsopọ̀ láti ka fọ́tò tiyín. Ẹ gbìyànjú lẹ́tà àpẹẹrẹ fún báyìí.", "Ina buƙatar haɗi don karanta hotonka. Gwada wasiƙar misali yanzu.", "Achọrọ m njikọ ka m gụọ foto gị. Nwaa akwụkwọ ozi ihe atụ ugbu a."),
} satisfies Record<string, Lines>;

export function t(key: keyof typeof T, lang: Lang, vars: Record<string, string> = {}) {
  let s = T[key][lang] || T[key].en;
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}
