import type { Example } from "./types";
import { lemmaOf } from "./types";
import { kidGloss } from "./kid-gloss";

const UNCOUNTABLE = new Set([
  "water",
  "milk",
  "juice",
  "tea",
  "coffee",
  "rice",
  "bread",
  "soup",
  "food",
  "grass",
  "meat",
  "pork",
  "beef",
  "hair",
  "weather",
  "homework",
  "information",
  "music",
  "paper",
  "money",
  "time",
  "fun",
  "help",
  "work",
  "sleep",
  "rain",
  "snow",
  "wind",
  "sunlight",
  "air",
  "ice",
  "butter",
  "cheese",
  "sugar",
  "salt",
  "flour",
  "hay",
  "rubbish",
  "litter",
]);

const ANIMALS = new Set([
  "cat",
  "dog",
  "pig",
  "cow",
  "duck",
  "chick",
  "hen",
  "bird",
  "fish",
  "frog",
  "rabbit",
  "mouse",
  "bear",
  "tiger",
  "lion",
  "monkey",
  "panda",
  "elephant",
  "horse",
  "sheep",
  "fox",
  "hippo",
  "zebra",
  "prawn",
  "bee",
  "ant",
  "butterfly",
]);

const WEATHER = new Set([
  "sunny",
  "rainy",
  "cloudy",
  "windy",
  "snowy",
  "foggy",
  "stormy",
  "hot",
  "cold",
  "warm",
  "cool",
]);

const FEELING = new Set([
  "hungry",
  "thirsty",
  "tired",
  "sick",
  "happy",
  "sad",
  "afraid",
  "angry",
  "ill",
]);

const PEOPLE_ADJ = new Set([
  "tall",
  "short",
  "young",
  "old",
  "thin",
  "fat",
  "slim",
  "strong",
  "clever",
  "naughty",
  "kind",
  "cute",
  "lovely",
  "beautiful",
  "good-looking",
  "helpful",
  "lucky",
  "poor",
  "healthy",
  "unhealthy",
  "noisy",
  "quiet",
  "friendly",
]);

const SPECIALS: Record<string, Example> = {
  "a few": { en: "I have a few books.", zh: "我有几本书。" },
  "a little": { en: "I need a little water.", zh: "我需要一点水。" },
  "a lot": { en: "Thanks a lot.", zh: "非常感谢。" },
  "a pair of gloves": { en: "I wear a pair of gloves.", zh: "我戴一副手套。" },
  about: { en: "This book is about animals.", zh: "这本书是关于动物的。" },
  afraid: { en: "I am not afraid.", zh: "我不害怕。" },
  afternoon: { en: "See you this afternoon.", zh: "下午见。" },
  agree: { en: "I agree with you.", zh: "我同意你。" },
  all: { en: "We all like fruit.", zh: "我们都喜欢水果。" },
  almost: { en: "I am almost ready.", zh: "我差不多准备好了。" },
  already: { en: "I have already eaten.", zh: "我已经吃过了。" },
  also: { en: "I also like apples.", zh: "我也喜欢苹果。" },
  always: { en: "I always brush my teeth.", zh: "我总是刷牙。" },
  along: { en: "We walk along the river.", zh: "我们沿着河边走。" },
  another: { en: "Can I have another one?", zh: "我可以再要一个吗？" },
  around: { en: "There are trees around the house.", zh: "房子周围有树。" },
  "arrive at": { en: "We arrive at school at eight.", zh: "我们八点到学校。" },
  arrive: { en: "The bus arrives at eight.", zh: "公交车八点到。" },
  "as ... as": { en: "She is as tall as me.", zh: "她和我一样高。" },
  "at first": { en: "At first I was shy.", zh: "起初我有点害羞。" },
  "be born": { en: "I was born in May.", zh: "我五月出生。" },
  beautiful: { en: "The flower is beautiful.", zh: "这朵花很美。" },
  before: { en: "Wash your hands before lunch.", zh: "午饭前要洗手。" },
  begin: { en: "Class begins at eight.", zh: "八点开始上课。" },
  behind: { en: "The cat is behind the door.", zh: "猫在门后面。" },
  "boarding card": { en: "Show me your boarding card.", zh: "请出示登机牌。" },
  born: { en: "She was born in Shanghai.", zh: "她在上海出生。" },
  both: { en: "Both cats are white.", zh: "两只猫都是白的。" },
  bring: { en: "Please bring your book.", zh: "请把书带来。" },
  "brush my teeth": { en: "I brush my teeth every morning.", zh: "我每天早上刷牙。" },
  by: { en: "I go to school by bus.", zh: "我坐公交车上学。" },
  carefully: { en: "Please write carefully.", zh: "请认真写。" },
  "cat food": { en: "The cat likes cat food.", zh: "猫喜欢猫粮。" },
  celebrate: { en: "We celebrate New Year.", zh: "我们庆祝新年。" },
  collect: { en: "I collect stamps.", zh: "我集邮。" },
  "come back": { en: "Please come back soon.", zh: "请快点回来。" },
  "computer lab": { en: "We study in the computer lab.", zh: "我们在电脑室学习。" },
  "cut down": { en: "Do not cut down trees.", zh: "不要砍树。" },
  did: { en: "I did my homework.", zh: "我做完作业了。" },
  different: { en: "These two bags are different.", zh: "这两个包不一样。" },
  discuss: { en: "Let's discuss the story.", zh: "我们来讨论这个故事。" },
  "dog food": { en: "The dog eats dog food.", zh: "狗吃狗粮。" },
  "Don't litter.": { en: "Don't litter in the park.", zh: "公园里不要乱扔垃圾。" },
  "each other": { en: "They help each other.", zh: "他们互相帮助。" },
  evening: { en: "We eat dinner in the evening.", zh: "我们晚上吃晚饭。" },
  "family tree": { en: "This is my family tree.", zh: "这是我家的家谱。" },
  "far away": { en: "The school is not far away.", zh: "学校并不远。" },
  few: { en: "I have a few pencils.", zh: "我有几支铅笔。" },
  fiercely: { en: "The wind blows fiercely.", zh: "风刮得很猛。" },
  finally: { en: "Finally we arrive home.", zh: "最后我们到家了。" },
  first: { en: "I sit in the first row.", zh: "我坐在第一排。" },
  forget: { en: "Don't forget your bag.", zh: "别忘了你的包。" },
  frozen: { en: "The lake is frozen.", zh: "湖面结冰了。" },
  gently: { en: "Hold the kitten gently.", zh: "轻轻抱着小猫。" },
  "go shopping": { en: "Mum and I go shopping.", zh: "妈妈和我去购物。" },
  "good at": { en: "She is good at English.", zh: "她英语很好。" },
  grow: { en: "Trees grow in the park.", zh: "公园里树在生长。" },
  had: { en: "I had breakfast at seven.", zh: "我七点吃了早餐。" },
  "half an hour": { en: "The film is half an hour long.", zh: "这部电影半小时。" },
  happily: { en: "The children play happily.", zh: "孩子们开心地玩。" },
  "have to": { en: "I have to go now.", zh: "我现在得走了。" },
  heard: { en: "I heard a bird.", zh: "我听见一只鸟。" },
  his: { en: "That is his book.", zh: "那是他的书。" },
  however: { en: "I like it. However, it is small.", zh: "我喜欢它。不过它很小。" },
  "ice cream": { en: "I eat ice cream in summer.", zh: "我夏天吃冰淇淋。" },
  immediately: { en: "Come here immediately.", zh: "马上过来。" },
  "in danger": { en: "The animals are in danger.", zh: "这些动物有危险。" },
  "in front of": { en: "The bus stops in front of the school.", zh: "公交车停在学校前面。" },
  "in the middle": { en: "She sits in the middle.", zh: "她坐在中间。" },
  inside: { en: "Please wait inside the classroom.", zh: "请在教室里面等。" },
  instead: { en: "I walk instead.", zh: "我改走路。" },
  "instead of": { en: "I walk instead of taking a bus.", zh: "我走路，不坐公交车。" },
  IT: { en: "We have an IT class today.", zh: "我们今天有信息技术课。" },
  join: { en: "I want to join the club.", zh: "我想加入这个社团。" },
  just: { en: "I just arrived.", zh: "我刚到。" },
  keep: { en: "Please keep the room clean.", zh: "请保持房间干净。" },
  later: { en: "See you later.", zh: "回头见。" },
  leave: { en: "We leave school at four.", zh: "我们四点离校。" },
  lie: { en: "The cat lies on the sofa.", zh: "猫躺在沙发上。" },
  lift: { en: "Please help me lift the box.", zh: "请帮我抬这个箱子。" },
  "light rail": { en: "I take the light rail to school.", zh: "我坐轻轨上学。" },
  "living room": { en: "We watch TV in the living room.", zh: "我们在客厅看电视。" },
  "look after": { en: "I look after my little sister.", zh: "我照顾妹妹。" },
  "look for": { en: "I look for my pencil.", zh: "我在找铅笔。" },
  "Los Angeles": { en: "They live in Los Angeles.", zh: "他们住在洛杉矶。" },
  lose: { en: "Don't lose your key.", zh: "别把钥匙弄丢。" },
  loudly: { en: "Please don't talk loudly.", zh: "请不要大声说话。" },
  "made of": { en: "The desk is made of wood.", zh: "这张桌子是木头做的。" },
  many: { en: "I have many books.", zh: "我有很多书。" },
  match: { en: "We watch a football match.", zh: "我们看足球比赛。" },
  may: { en: "May I come in?", zh: "我可以进来吗？" },
  me: { en: "Can you help me?", zh: "你能帮帮我吗？" },
  Miss: { en: "Good morning, Miss Li.", zh: "早上好，李老师。" },
  "model plane": { en: "He plays with a model plane.", zh: "他玩模型飞机。" },
  "moon cake": { en: "We eat moon cakes in autumn.", zh: "我们秋天吃月饼。" },
  most: { en: "Most children like games.", zh: "大多数孩子喜欢游戏。" },
  Mr: { en: "Mr Wang is our teacher.", zh: "王老师是我们的老师。" },
  Mrs: { en: "Mrs Chen is kind.", zh: "陈太太很和善。" },
  never: { en: "I never litter.", zh: "我从不乱扔垃圾。" },
  next: { en: "Who is next?", zh: "下一个是谁？" },
  "next to": { en: "I sit next to my friend.", zh: "我坐在朋友旁边。" },
  night: { en: "I sleep at night.", zh: "我晚上睡觉。" },
  none: { en: "None of the cups is broken.", zh: "杯子一个都没坏。" },
  nowadays: { en: "Nowadays many people use phones.", zh: "现在很多人用手机。" },
  nurse: { en: "The nurse is kind.", zh: "护士很和善。" },
  often: { en: "I often read at home.", zh: "我经常在家看书。" },
  "on foot": { en: "I go to school on foot.", zh: "我走路上学。" },
  "on the left": { en: "The library is on the left.", zh: "图书馆在左边。" },
  once: { en: "I go there once a week.", zh: "我一周去一次。" },
  only: { en: "I have only one apple.", zh: "我只有一个苹果。" },
  our: { en: "This is our classroom.", zh: "这是我们的教室。" },
  PE: { en: "We have PE on Monday.", zh: "我们星期一有体育课。" },
  "pencil case": { en: "My pencil is in the pencil case.", zh: "铅笔在铅笔盒里。" },
  "pick up": { en: "Please pick up the paper.", zh: "请把纸捡起来。" },
  "plant a tree": { en: "We plant a tree in spring.", zh: "我们春天种树。" },
  "play football": { en: "They play football after school.", zh: "他们放学后踢足球。" },
  pollute: { en: "Cars can pollute the air.", zh: "汽车会污染空气。" },
  "poor at": { en: "I am poor at maths.", zh: "我数学不太好。" },
  "post office": { en: "I send a letter at the post office.", zh: "我在邮局寄信。" },
  practise: { en: "I practise English every day.", zh: "我每天练习英语。" },
  prepare: { en: "Please prepare your books.", zh: "请把书准备好。" },
  provide: { en: "The farm provides fresh eggs.", zh: "农场提供新鲜鸡蛋。" },
  "put on": { en: "Put on your coat.", zh: "穿上外套。" },
  "put out": { en: "Please put out the fire.", zh: "请把火扑灭。" },
  quickly: { en: "Please come quickly.", zh: "请快点来。" },
  really: { en: "I really like this song.", zh: "我真的喜欢这首歌。" },
  remember: { en: "Please remember my name.", zh: "请记住我的名字。" },
  "rubbish bin": { en: "Put it in the rubbish bin.", zh: "把它放进垃圾桶。" },
  same: { en: "We have the same bag.", zh: "我们的包是一样的。" },
  sat: { en: "She sat next to me.", zh: "她坐在我旁边。" },
  "school bag": { en: "My books are in the school bag.", zh: "书在书包里。" },
  "science museum": { en: "We visit the science museum.", zh: "我们去科技馆。" },
  "sea horse": { en: "I see a sea horse.", zh: "我看见一只海马。" },
  second: { en: "He is the second boy.", zh: "他是第二个男孩。" },
  "seven o'clock": { en: "I get up at seven o'clock.", zh: "我七点起床。" },
  shall: { en: "Shall we go now?", zh: "我们现在走好吗？" },
  "shop assistant": { en: "The shop assistant is helpful.", zh: "店员很帮忙。" },
  should: { en: "You should drink water.", zh: "你应该喝水。" },
  "sit down": { en: "Please sit down.", zh: "请坐下。" },
  "slide show": { en: "We watch a slide show.", zh: "我们看幻灯片。" },
  slightly: { en: "It is slightly cold.", zh: "天气有一点冷。" },
  slowly: { en: "Please speak slowly.", zh: "请说慢一点。" },
  some: { en: "I want some milk.", zh: "我想要一些牛奶。" },
  sometimes: { en: "I sometimes walk to school.", zh: "我有时走路上学。" },
  "south-east": { en: "Shanghai is in the south-east.", zh: "上海在东南边。" },
  "stand up": { en: "Please stand up.", zh: "请站起来。" },
  still: { en: "It is still raining.", zh: "天还在下雨。" },
  "stomach ache": { en: "I have a stomach ache.", zh: "我胃痛。" },
  strongly: { en: "The wind blows strongly.", zh: "风刮得很猛。" },
  suddenly: { en: "Suddenly it starts to rain.", zh: "突然下起雨来。" },
  "take a photograph": { en: "Can I take a photograph?", zh: "我可以拍一张照片吗？" },
  take: { en: "Please take this book.", zh: "请拿着这本书。" },
  teach: { en: "Miss Li teaches English.", zh: "李老师教英语。" },
  than: { en: "She is taller than me.", zh: "她比我高。" },
  "the Spring Festival": { en: "We eat dumplings at the Spring Festival.", zh: "春节我们吃饺子。" },
  "the sun": { en: "The sun is bright.", zh: "太阳很亮。" },
  then: { en: "Wash your hands, then eat.", zh: "先洗手，然后吃饭。" },
  there: { en: "There is a cat.", zh: "有一只猫。" },
  ticket: { en: "I have a bus ticket.", zh: "我有一张公交车票。" },
  tightly: { en: "Hold the rope tightly.", zh: "把绳子握紧。" },
  tired: { en: "I am tired after PE.", zh: "体育课后我很累。" },
  "toy train": { en: "The boy has a toy train.", zh: "男孩有一列玩具火车。" },
  "traffic jam": { en: "There is a traffic jam.", zh: "路上堵车了。" },
  "turn off": { en: "Please turn off the light.", zh: "请把灯关掉。" },
  TV: { en: "I watch TV after dinner.", zh: "我晚饭后看电视。" },
  twice: { en: "I brush my teeth twice a day.", zh: "我每天刷两次牙。" },
  usually: { en: "I usually get up at seven.", zh: "我通常七点起床。" },
  very: { en: "I am very happy.", zh: "我非常开心。" },
  "very much": { en: "Thank you very much.", zh: "非常感谢。" },
  "wait for": { en: "Please wait for me.", zh: "请等我一下。" },
  was: { en: "I was at home yesterday.", zh: "我昨天在家。" },
  were: { en: "They were in the park.", zh: "他们刚才在公园。" },
  without: { en: "Don't go without your bag.", zh: "别不带包就走。" },
  "would rather": { en: "I would rather walk.", zh: "我宁愿走路。" },
  "write an e-mail": { en: "I write an e-mail to Grandma.", zh: "我给奶奶写电子邮件。" },
  yet: { en: "I am not ready yet.", zh: "我还没准备好。" },
};

function article(word: string): "a" | "an" {
  const first = word.trim().split(/\s+/)[0] ?? word;
  return /^[aeiou]/i.test(first) ? "an" : "a";
}

function classifier(lemma: string): string {
  return ANIMALS.has(lemma) ? "只" : "个";
}

export function isPlaceholderExample(ex: Example | undefined): boolean {
  if (!ex) return true;
  return /^this is\b/i.test(ex.en.trim()) || ex.zh.includes("「") || /^这是「/.test(ex.zh);
}

export function makeExample(word: string, pos: string, zhRaw: string): Example {
  const lemma = lemmaOf(word);
  const special = SPECIALS[lemma] ?? SPECIALS[word];
  if (special) return special;

  const zh = kidGloss(zhRaw, word);
  const p = pos.toLowerCase();

  if (word.includes(" ")) {
    if (/^(look|go|sit|stand|come|put|take|wait|cut|play|write|brush|plant|pick|turn|arrive|have)\b/i.test(word)) {
      return { en: `I ${word}.`, zh: `我${zh}。` };
    }
    return { en: `I like ${word}.`, zh: `我喜欢${zh}。` };
  }

  if (p === "v") {
    return { en: `I can ${word}.`, zh: `我会${zh}。` };
  }
  if (p === "adj") {
    if (WEATHER.has(lemma)) return { en: `It is ${word} today.`, zh: `今天${zh}。` };
    if (FEELING.has(lemma)) return { en: `I am ${word}.`, zh: `我${zh}。` };
    if (PEOPLE_ADJ.has(lemma)) return { en: `She is ${word}.`, zh: `她很${zh.replace(/的$/, "")}。` };
    return { en: `The cake is ${word}.`, zh: `蛋糕是${zh}。` };
  }
  if (p === "adv") {
    if (word.endsWith("ly")) return { en: `Please speak ${word}.`, zh: `请${zh}说话。` };
    return { en: `I ${word} play football.`, zh: `我${zh}踢足球。` };
  }
  if (p === "prep") {
    return { en: `The book is ${word} the bag.`, zh: `书${zh}包。` };
  }
  if (p === "conj") {
    return { en: `I like cats ${word} dogs.`, zh: `我喜欢猫${zh}狗。` };
  }
  if (p === "pron") {
    return { en: `This bag is ${word}.`, zh: `这个包是${zh}。` };
  }
  if (p === "num") {
    if (/th$|first|second|third/.test(lemma)) {
      return { en: `He is the ${word} student.`, zh: `他是${zh}个学生。` };
    }
    return { en: `I have ${word} books.`, zh: `我有${zh}本书。` };
  }
  if (p === "int") {
    return { en: `${word}!`, zh: `${zh}！` };
  }
  if (p === "det") {
    return { en: `I want ${word} water.`, zh: `我想要${zh}水。` };
  }

  if (UNCOUNTABLE.has(lemma)) {
    if (["water", "milk", "juice", "tea", "coffee", "soup"].includes(lemma)) {
      return { en: `I drink ${word}.`, zh: `我喝${zh}。` };
    }
    if (["rice", "bread", "meat", "pork", "beef", "food"].includes(lemma)) {
      return { en: `I eat ${word}.`, zh: `我吃${zh}。` };
    }
    return { en: `I need ${word}.`, zh: `我需要${zh}。` };
  }

  const art = article(word);
  const cls = classifier(lemma);
  return { en: `I have ${art} ${word}.`, zh: `我有一${cls}${zh}。` };
}
