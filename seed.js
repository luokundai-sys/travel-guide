// 种子攻略数据 —— 自用工具的起步内容，后面可自己增删。
// Guide: 一份目的地攻略；pois 是该攻略推荐的景点/美食/活动。
// POI.type: 景点 | 美食 | 住宿 | 活动
window.SEED_GUIDES = [
  {
    id: "g-chengdu",
    dest: "成都",
    title: "成都 3 天慢生活",
    days: 3,
    season: "四季皆宜，3-5 月最舒服",
    tags: ["美食", "熊猫", "悠闲", "国内"],
    summary: "吃辣、看熊猫、泡茶馆。节奏放慢，不赶景点。",
    pois: [
      { id: "cd-panda", name: "成都大熊猫繁育研究基地", type: "景点", area: "城北", duration: "半天", desc: "早上 8 点前到，熊猫最活跃。建议买观光车票。" },
      { id: "cd-kuanzhai", name: "宽窄巷子", type: "景点", area: "市中心", duration: "2 小时", desc: "老成都街巷，拍照+小吃，避开正午人潮。" },
      { id: "cd-jinli", name: "锦里古街", type: "景点", area: "武侯祠旁", duration: "2 小时", desc: "晚上灯光好看，连着武侯祠一起逛。" },
      { id: "cd-hotpot", name: "老码头火锅", type: "美食", area: "市区多店", duration: "2 小时", desc: "经典牛油锅底，鸭肠毛肚必点。" },
      { id: "cd-renmin", name: "人民公园鹤鸣茶社", type: "活动", area: "市中心", duration: "2 小时", desc: "盖碗茶+掏耳朵，体验成都慢节奏。" }
    ]
  },
  {
    id: "g-dali",
    dest: "大理",
    title: "大理 4 天环洱海",
    days: 4,
    season: "3-4 月 / 9-11 月，避开雨季",
    tags: ["自然", "骑行", "发呆", "国内"],
    summary: "洱海边骑行、古城闲逛、苍山徒步。租车或包车更自由。",
    pois: [
      { id: "dl-erhai", name: "洱海生态廊道骑行", type: "活动", area: "环湖", duration: "半天", desc: "租电动车，挑一段海西骑，喜洲到才村风景最好。" },
      { id: "dl-xizhou", name: "喜洲古镇", type: "景点", area: "海北", duration: "半天", desc: "白族民居+稻田，喜洲粑粑必吃。" },
      { id: "dl-gucheng", name: "大理古城", type: "景点", area: "古城", duration: "半天", desc: "傍晚逛人民路，吃饭喝酒看人。" },
      { id: "dl-cangshan", name: "苍山感通索道", type: "景点", area: "苍山", duration: "半天", desc: "上山徒步玉带云游路，体力好可走一段。" },
      { id: "dl-rxx", name: "海景民宿（双廊/才村）", type: "住宿", area: "海东", duration: "—", desc: "选带露台看洱海日出的，提前订。" }
    ]
  },
  {
    id: "g-kyoto",
    dest: "京都",
    title: "京都 4 天古都漫步",
    days: 4,
    season: "3 月底樱花 / 11 月红叶",
    tags: ["历史", "寺庙", "和风", "出境"],
    summary: "寺庙神社+和服体验+京料理。买公交一日券，景点集中。",
    pois: [
      { id: "kt-fushimi", name: "伏见稻荷大社", type: "景点", area: "南部", duration: "半天", desc: "千本鸟居，早上 7 点前去人少出片。" },
      { id: "kt-arashiyama", name: "岚山竹林", type: "景点", area: "西部", duration: "半天", desc: "竹林+渡月桥，可坐小火车。" },
      { id: "kt-kiyomizu", name: "清水寺 + 二三年坂", type: "景点", area: "东山", duration: "半天", desc: "穿和服逛坂道，傍晚看夕阳。" },
      { id: "kt-gion", name: "祇园 + 花见小路", type: "活动", area: "东山", duration: "2 小时", desc: "傍晚有机会偶遇艺伎，注意礼仪别围拍。" },
      { id: "kt-nishiki", name: "锦市场", type: "美食", area: "市中心", duration: "2 小时", desc: "京都厨房，边走边吃豆乳甜甜圈、玉子烧。" }
    ]
  },
  {
    id: "g-xian",
    dest: "西安",
    title: "西安 3 天看千年",
    days: 3,
    season: "3-5 月 / 9-10 月",
    tags: ["历史", "美食", "兵马俑", "国内"],
    summary: "兵马俑+城墙+回民街。历史厚重，吃得过瘾。",
    pois: [
      { id: "xa-bmy", name: "秦始皇兵马俑", type: "景点", area: "临潼", duration: "半天", desc: "请讲解或租导览器，先看一号坑震撼。" },
      { id: "xa-citywall", name: "西安城墙骑行", type: "活动", area: "市中心", duration: "2 小时", desc: "租自行车环城一圈约 2 小时，落日好看。" },
      { id: "xa-huimin", name: "回民街 + 永兴坊", type: "美食", area: "市中心", duration: "2 小时", desc: "肉夹馍、泡馍、摔碗酒，永兴坊比回民街本地。" },
      { id: "xa-dayan", name: "大雁塔 + 大唐不夜城", type: "景点", area: "曲江", duration: "半天", desc: "晚上看灯光秀和不倒翁小姐姐。" },
      { id: "xa-bowuguan", name: "陕西历史博物馆", type: "景点", area: "市中心", duration: "半天", desc: "需提前约票，国宝级文物，建议请讲解。" }
    ]
  }
];
