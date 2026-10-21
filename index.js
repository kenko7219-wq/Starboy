const { Telegraf, Markup, session } = require('telegraf');
const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const http = require('http');
const axios = require('axios');

// ==========================================
// Button Color Styling (Monkey Patch)
// ==========================================
function getButtonStyle(data) {
  if (!data) return null;
  if (data.startsWith('restart_bot:')) return 'success';
  if (data.startsWith('manual_confirm_')) return 'success';
  if (data === 'manual_cancel') return 'danger';
  if (data === 'mode:real') return 'success';
  if (data === 'sl_layer:0' || data === 'bs_wait_count:0' || data === 'bb_wait_count:0') return 'danger';
  if (/^(strategy|bet_type|game_type|mode|betting_strategy|entry_layer|sl_layer|bs_wait_count|bb_wait_count):/.test(data)) return 'primary';
  if (/^manual_(amt|mult|res_page)_/.test(data)) return 'primary';
  return null;
}

const _origCallback = Markup.button.callback;
Markup.button.callback = (text, data, hide) => {
  const b = _origCallback(text, data, hide);
  const style = getButtonStyle(data);
  if (style) b.style = style;
  return b;
};
// ==========================================

const logging = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  warning: (msg) => console.log(`[WARN] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.log(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  debug: (msg) => console.log(`[DEBUG] ${new Date().toISOString()} - ${msg}`)
};

const userState = {};
const userTemp = {};
const userSessions = {};
const userPendingBets = {};
const userWaitingForResult = {};
const userSkippedBets = {};
const userShouldSkipNext = {};
const userBalanceWarnings = {};
const userSkipResultWait = {};
const userAllResults = {};
const userStopInitiated = {};
const userSLSkipWaitingForWin = {};
const userPlatforms = {};
const userCredentials = {};
const userAILast10Results = {};
const userAIRoundCount = {};
let userSettings = {};
let userGameInfo = {};
let userStats = {};
let userLastResults = {};
let userManualBet = {};
let userManualBets = {};

let allowedsixlotteryIds = new Set();
const activeUsers = new Set();
let adminSet = new Set();

// ==================== PLATFORMS ====================
const PLATFORMS = {
  "6LOTTERY": {
    name: "6LOTTERY",
    baseUrl: "https://6lotteryapi.com/api/webapi/",
    color: "🔴"
  },
  "CKLOTTERY": {
    name: "CKLOTTERY",
    baseUrl: "https://ckygjf6r.com/api/webapi/",
    color: "🔵"
  }
};
// ==================================================

const COLORS = {
  GREEN: { name: 'Green', id: 11, numbers: [1, 3, 7, 9] },
  VIOLET: { name: 'Violet', id: 12, numbers: [0, 5] },
  RED: { name: 'Red', id: 10, numbers: [2, 4, 6, 8] }
};

const EMOJI = {
  WIN: '✅',
  LOSS: '❌',
  RESULT: '📋',
  SKIP: '⏭️',
  BET: '🤹‍♂️',
  BETWRAGER: '🤹‍♂️',
  BALANCE: '🛍',
  PROFIT: '🧾',
  LOSS_ICON: '♦️',
  START: '▶️',
  STOP: '⏸️',
  SETTINGS: '🛠',
  STATS: '🔖',
  LOGIN: '🖲',
  LOGOUT: '🕹',
  BACK: '🔙',
  MENU: '🔖',
  GAME: '🎮',
  STRATEGY: '🧬',
  RISK: '🩰',
  TARGET: '🎯',
  LAYER: '📥',
  MODE: '🎛',
  INFO: '📑',
  ADMIN: '🏂',
  USER: '🎭',
  ADD: '➕',
  REMOVE: '➖',
  BROADCAST: '🎙',
  CHECK: '🔍',
  WARNING: '❗️',
  ERROR: '🚫',
  LOADING: '🎞',
  SUCCESS: '📟',
  WAIT: '🔜',
  VIRTUAL: '🖥',
  REAL: '💵',
  TREND: '🧲',
  ALTERNATE: '🔁',
  PATTERN: '🎶',
  COLOR: '🖼',
  GREEN: '🟢',
  VIOLET: '🟣',
  RED: '🔴',
  MARTINGALE: '📹',
  ANTI_MARTINGALE: '🎥',
  DALEMBERT: '📽',
  CUSTOM: '📠',
  TIME: '⌛️',
  RESULTSBS: '📊'
};

const STYLE = {
  SEPARATOR: '─'.repeat(15),
  BOLD: (text) => `*${text}*`,
  CODE: (text) => `\`${text}\``,
  HEADER: (text) => `🔥 *${text}* 🔥`,
  ITEM: (text) => `├─ ${text}`,
  LAST_ITEM: (text) => `└─ ${text}`,
  INFO: (text) => `ℹ️ ${text}`
};

const BOT_TOKEN = "8504941407:AAHJwJAMgkqrdcags99lbgv5q2Srq41Nw2w";
const ADMIN_ID = 8769857023;
const WIN_LOSE_CHECK_INTERVAL = 5;
const MAX_BALANCE_RETRIES = 10;
const BALANCE_RETRY_DELAY = 5;
const MAX_BET_RETRIES = 5;
const BET_RETRY_DELAY = 5;
const MAX_CONSECUTIVE_ERRORS = 10;
const MAX_TELEGRAM_RETRIES = 3;
const TELEGRAM_RETRY_DELAY = 2000;
const DEFAULT_BS_ORDER = "BSBBSBSSSB";
const LEO_BIG_PATTERN = "BBSBSSSBSB";
const LEO_SMALL_PATTERN = "SSBSBBBSBS";
const SNIPER_MAX_HITS = 2;
const SNIPER_MAX_LOSSES = 4;

// ===== DREAM PATTERNS =====
const dreamPatterns = {
  "0": "SBBSBSSBBS",
  "1": "BBSBSBSBBS",
  "2": "SBSBBSBSBB",
  "3": "BSBSBSSBSB",
  "4": "SBBSBSBBSS",
  "5": "BSSBSBBSBS",
  "6": "BSBSSBSBSB",
  "7": "SBSBSBSSBB",
  "8": "BSBBSBSBSB",
  "9": "SBSBBSSBSB"
};
// =========================

function loadAdmins() {
  try {
    if (fs.existsSync('admins.json')) {
      const data = JSON.parse(fs.readFileSync('admins.json', 'utf8'));
      adminSet = new Set(data.admin_ids || []);
    } else adminSet = new Set();
    adminSet.add(ADMIN_ID);
    saveAdmins();
  } catch (error) {
    adminSet = new Set([ADMIN_ID]);
  }
}

function saveAdmins() {
  try {
    fs.writeFileSync('admins.json', JSON.stringify({ admin_ids: Array.from(adminSet) }, null, 4));
  } catch (error) {}
}

function isAdmin(userId) {
  return userId === ADMIN_ID || adminSet.has(userId);
}

function saveUserSettings() {
  try {
    fs.writeFileSync('user_settings.json', JSON.stringify({
      userSettings, userGameInfo, userStats, userLastResults
    }, null, 4));
  } catch (error) {}
}

function loadUserSettings() {
  try {
    if (fs.existsSync('user_settings.json')) {
      const data = JSON.parse(fs.readFileSync('user_settings.json', 'utf8'));
      Object.assign(userSettings, data.userSettings || {});
      Object.assign(userGameInfo, data.userGameInfo || {});
      Object.assign(userStats, data.userStats || {});
      Object.assign(userLastResults, data.userLastResults || {});
    }
  } catch (error) {}
}

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });
    const requestOptions = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0',
        'Ar-Origin': 'https://6win598.com',
        'Origin': 'https://6win598.com',
        'Referer': 'https://6win598.com/',
      },
      timeout: 12000,
      ...options,
      agent
    };
    const req = https.request(url, requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve({ data: JSON.parse(data) }); }
        catch (e) { reject(new Error(`Parse error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

function loadAllowedUsers() {
  try {
    if (fs.existsSync('users_6lottery.json')) {
      const data = JSON.parse(fs.readFileSync('users_6lottery.json', 'utf8'));
      allowedsixlotteryIds = new Set(data.allowed_ids || []);
    } else allowedsixlotteryIds = new Set();
  } catch (error) { allowedsixlotteryIds = new Set(); }
}

function saveAllowedUsers() {
  try {
    fs.writeFileSync('users_6lottery.json', JSON.stringify({
      allowed_ids: Array.from(allowedsixlotteryIds)
    }, null, 4));
  } catch (error) {}
}

function normalizeText(text) { return text.normalize('NFKC').trim(); }

function signMd5(data) {
  const filtered = {};
  for (const [key, value] of Object.entries(data)) {
    if (key !== "signature" && key !== "timestamp") filtered[key] = value;
  }
  const sorted = Object.keys(filtered).sort().reduce((acc, key) => {
    acc[key] = filtered[key]; return acc;
  }, {});
  return crypto.createHash('md5').update(JSON.stringify(sorted).replace(/\s+/g, '')).digest('hex').toUpperCase();
}

function computeUnitAmount(amt) {
  if (amt <= 0) return 1;
  const amtStr = Math.floor(amt).toString();
  const trailingZeros = amtStr.length - amtStr.replace(/0+$/, '').length;
  if (trailingZeros >= 4) return 10000;
  if (trailingZeros === 3) return 1000;
  if (trailingZeros === 2) return 100;
  if (trailingZeros === 1) return 10;
  return Math.pow(10, amtStr.length - 1);
}

function getSelectMap(gameType, betType) {
  if (betType === 'COLOR') return { "G": 11, "V": 12, "R": 10 };
  return { "B": 13, "S": 14 };
}

function numberToColor(num) {
  if (COLORS.GREEN.numbers.includes(num)) return 'G';
  if (COLORS.VIOLET.numbers.includes(num)) return 'V';
  if (COLORS.RED.numbers.includes(num)) return 'R';
  return 'G';
}

function getColorName(colorCode) {
  switch(colorCode) {
    case 'G': return COLORS.GREEN.name;
    case 'V': return COLORS.VIOLET.name;
    case 'R': return COLORS.RED.name;
    default: return 'Unknown';
  }
}

function getValidDalembertBetAmount(unitSize, currentUnits, balance, minBet) {
  let amount = unitSize * currentUnits;
  while (amount > balance && currentUnits > 1) { currentUnits--; amount = unitSize * currentUnits; }
  if (amount > balance) amount = balance;
  if (amount < minBet) amount = minBet;
  return { amount, adjustedUnits: currentUnits };
}

function computeBetDetails(desiredAmount) {
  if (desiredAmount <= 0) return { unitAmount: 0, betCount: 0, actualAmount: 0 };
  const unitAmount = computeUnitAmount(desiredAmount);
  const betCount = Math.max(1, Math.floor(desiredAmount / unitAmount));
  return { unitAmount, betCount, actualAmount: unitAmount * betCount };
}

function calculateBetAmount(settings, currentBalance) {
  const bettingStrategy = settings.betting_strategy || "Martingale";
  const betSizes = settings.bet_sizes || [100];
  
  let index = 0;
  if (bettingStrategy === "D'Alembert") {
    if (betSizes.length > 1) throw new Error("D'Alembert requires only ONE Bet_Wrager");
    const unitSize = typeof betSizes[0] === 'number' ? betSizes[0] : 100;
    let units = settings.dalembert_units || 1;
    const { amount: validAmount, adjustedUnits } = getValidDalembertBetAmount(unitSize, units, currentBalance, unitSize);
    if (adjustedUnits !== units) settings.dalembert_units = adjustedUnits;
    return validAmount;
  } else if (bettingStrategy === "Custom") {
    index = Math.min(settings.custom_index || 0, betSizes.length - 1);
  } else {
    index = Math.min(settings.martin_index || 0, betSizes.length - 1);
  }

  let size = betSizes[index];
  if (size === 'ALL IN') {
    return Math.floor(currentBalance);
  } else if (size === 0) {
    return 0;
  }
  return size;
}

function updateBettingStrategy(settings, isWin, betAmount) {
  const bettingStrategy = settings.betting_strategy || "Martingale";
  const betSizes = settings.bet_sizes || [100];
  if (bettingStrategy === "Martingale") {
    settings.martin_index = isWin ? 0 : Math.min((settings.martin_index || 0) + 1, betSizes.length - 1);
  } else if (bettingStrategy === "Anti-Martingale") {
    settings.martin_index = isWin ? Math.min((settings.martin_index || 0) + 1, betSizes.length - 1) : 0;
  } else if (bettingStrategy === "D'Alembert") {
    settings.dalembert_units = isWin ? Math.max(1, (settings.dalembert_units || 1) - 1) : (settings.dalembert_units || 1) + 1;
  } else if (bettingStrategy === "Custom") {
    let actualIndex = 0;
    for (let i = 0; i < betSizes.length; i++) { if (betSizes[i] === betAmount) { actualIndex = i; break; } }
    settings.custom_index = isWin ? Math.max(0, actualIndex - 1) : Math.min(betSizes.length - 1, actualIndex + 1);
  }
}

function generateSignature(data) {
  const f = {};
  const exclude = ["signature", "track", "xosoBettingData"];
  Object.keys(data).sort().forEach(function(k) {
    const v = data[k];
    if (v !== null && v !== '' && !exclude.includes(k)) f[k] = v === 0 ? 0 : v;
  });
  return crypto.createHash('md5').update(JSON.stringify(f)).digest('hex').toUpperCase();
}

async function loginRequest(phone, password, baseUrl) {
  if (!baseUrl.endsWith('/')) baseUrl += '/';
  const loginData = {
    username: "95" + phone, pwd: password, phonetype: 1, logintype: "mobile",
    packId: "", deviceId: "5dcab3e06db88a206975e91ea6ac7c87", language: 7,
    random: crypto.randomBytes(16).toString('hex')
  };
  loginData.signature = generateSignature(loginData);
  loginData.timestamp = Math.floor(Date.now() / 1000);
  try {
    const response = await axios.post(baseUrl + "Login", loginData, {
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "Ar-Origin": "https://6win598.com",
        "Origin": "https://6win598.com",
        "Referer": "https://6win598.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0"
      },
      timeout: 15000
    });
    const res = response.data;
    if (res.code === 0 && res.data) {
      const tokenHeader = res.data.tokenHeader || "Bearer ";
      const token = res.data.token || "";
      const session = {
        post: async (endpoint, data) => {
          return makeRequest(baseUrl + endpoint, {
            method: 'POST',
            headers: {
              "Authorization": `${tokenHeader}${token}`,
              "Content-Type": "application/json; charset=UTF-8",
              "Ar-Origin": "https://6win598.com",
              "Origin": "https://6win598.com",
              "Referer": "https://6win598.com/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0"
            },
            body: data
          });
        }
      };
      return { response: res, session };
    }
    return { response: res, session: null };
  } catch (error) {
    return { response: { error: error.message }, session: null };
  }
}

async function getUserInfo(session, userId) {
  const body = { "language": 7, "random": "4fc9f8f8d6764a5f934d4c6a468644e0" };
  body.signature = generateSignature(body).toUpperCase();
  body.timestamp = Math.floor(Date.now() / 1000);
  try {
    const response = await session.post("GetUserInfo", body);
    const res = response.data;
    if (res.code === 0 && res.data) {
      const info = {
        user_id: res.data.userId, username: res.data.userName, nickname: res.data.nickName,
        balance: res.data.amount, photo: res.data.userPhoto, login_date: res.data.userLoginDate,
        withdraw_count: res.data.withdrawCount, is_allow_withdraw: res.data.isAllowWithdraw === 1
      };
      userGameInfo[userId] = info;
      return info;
    }
    return null;
  } catch (error) { return null; }
}

async function getBalance(session, userId) {
  const body = { "language": 7, "random": "71ebd56cff7d4679971c482807c33f6f" };
  body.signature = generateSignature(body).toUpperCase();
  body.timestamp = Math.floor(Date.now() / 1000);
  try {
    const response = await session.post("GetBalance", body);
    const res = response.data;
    if (res.code === 0 && res.data) {
      const amount = res.data.Amount || res.data.amount || res.data.balance;
      if (amount !== undefined && amount !== null) {
        const balance = parseFloat(amount);
        if (userGameInfo[userId]) userGameInfo[userId].balance = balance;
        if (!userStats[userId]) userStats[userId] = { start_balance: balance, profit: 0.0 };
        return balance;
      }
    }
    return null;
  } catch (error) { return null; }
}

async function getGameIssueRequest(session, gameType) {
  let typeId, endpoint;
  if (gameType === "TRX") { typeId = 13; endpoint = "GetTrxGameIssue"; }
  else if (gameType === "WINGO_30S") { typeId = 30; endpoint = "GetGameIssue"; }
  else if (gameType === "WINGO_3MIN") { typeId = 2; endpoint = "GetGameIssue"; }
  else if (gameType === "WINGO_5MIN") { typeId = 3; endpoint = "GetGameIssue"; }
  else { typeId = 1; endpoint = "GetGameIssue"; }
  const body = { "typeId": typeId, "language": 7, "random": "7d76f361dc5d4d8c98098ae3d48ef7af" };
  body.signature = signMd5(body).toUpperCase();
  body.timestamp = Math.floor(Date.now() / 1000);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await session.post(endpoint, body);
      if (response.data && response.data.code === 0) return response.data;
      if (attempt < 2) { await new Promise(r => setTimeout(r, 2000)); continue; }
      return response.data;
    } catch (error) {
      if (attempt < 2) { await new Promise(r => setTimeout(r, 2000)); continue; }
      return { error: error.message };
    }
  }
  return { error: "Failed after retries" };
}

async function placeBetRequest(session, issueNumber, selectType, unitAmount, betCount, gameType, userId) {
  let typeId, endpoint;
  if (gameType === "TRX") { typeId = 13; endpoint = "GameTrxBetting"; }
  else if (gameType === "WINGO_30S") { typeId = 30; endpoint = "GameBetting"; }
  else if (gameType === "WINGO_3MIN") { typeId = 2; endpoint = "GameBetting"; }
  else if (gameType === "WINGO_5MIN") { typeId = 3; endpoint = "GameBetting"; }
  else { typeId = 1; endpoint = "GameBetting"; }
  const isColorBet = [10, 11, 12].includes(parseInt(selectType));
  const actualGameType = isColorBet ? 0 : 2;
  if (!selectType || isNaN(selectType)) return { error: "Invalid selectType" };
  const betBody = {
    "typeId": typeId, "issuenumber": issueNumber, "language": 7,
    "gameType": actualGameType, "amount": unitAmount, "betCount": betCount,
    "selectType": parseInt(selectType), "random": "f9ec46840a374a65bb2abad44dfc4dc3"
  };
  betBody.signature = generateSignature(betBody).toUpperCase();
  betBody.timestamp = Math.floor(Date.now() / 1000);
  for (let attempt = 0; attempt < MAX_BET_RETRIES; attempt++) {
    try {
      const response = await session.post(endpoint, betBody);
      return response.data;
    } catch (error) {
      if (attempt < MAX_BET_RETRIES - 1) { await new Promise(r => setTimeout(r, BET_RETRY_DELAY * 1000)); continue; }
      return { error: error.message };
    }
  }
  return { error: "Failed after retries" };
}

async function getWingoGameResults(session, gameType = "WINGO") {
  let typeId;
  if (gameType === "WINGO_30S") typeId = 30;
  else if (gameType === "WINGO_3MIN") typeId = 2;
  else if (gameType === "WINGO_5MIN") typeId = 3;
  else typeId = 1;
  const body = { "pageSize": 10, "pageNo": 1, "typeId": typeId, "language": 7, "random": "4ad5325e389745a882f4189ed6550e70" };
  if (gameType === "WINGO_30S") { body.signature = "5483D466A138F08B6704354BAA7E7FB3"; body.timestamp = 1761247150; }
  else { body.signature = generateSignature(body).toUpperCase(); body.timestamp = Math.floor(Date.now() / 1000); }
  try {
    const response = await session.post("GetNoaverageEmerdList", body);
    return response.data;
  } catch (error) { return { error: error.message }; }
}

async function getGameResults20(session, gameType = "TRX") {
  let typeId;
  if (gameType === "TRX") typeId = 13;
  else if (gameType === "WINGO_30S") typeId = 30;
  else if (gameType === "WINGO_3MIN") typeId = 2;
  else if (gameType === "WINGO_5MIN") typeId = 3;
  else typeId = 1;
  const body = {
    "pageSize": 20, "pageNo": 1, "typeId": typeId, "language": 7,
    "random": crypto.randomBytes(16).toString('hex')
  };
  body.signature = generateSignature(body).toUpperCase();
  body.timestamp = Math.floor(Date.now() / 1000);
  try {
    const response = await session.post("GetNoaverageEmerdList", body);
    if (response.data && response.data.code === 0 && response.data.data && response.data.data.list) {
      return response.data.data.list;
    }
    return null;
  } catch (error) { return null; }
}

async function getTrxPublicResults() {
  const url = `https://draw.ar-lottery01.com/TrxWinGo/TrxWinGo_1M/GetHistoryIssuePage.json?ts=${Date.now()}`;
  try {
    const response = await axios.get(url, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0',
        'Referer': 'https://ar-lottery01.com/',
        'Origin': 'https://ar-lottery01.com'
      },
      timeout: 10000
    });
    const res = response.data;
    if (res && res.code === 0 && res.data && res.data.list && res.data.list.length > 0) return res.data.list;
    return null;
  } catch (error) { return null; }
}

async function getNextPeriodTimeLeft(session, gameType) {
  try {
    const issueRes = await getGameIssueRequest(session, gameType);
    if (!issueRes || issueRes.code !== 0 || !issueRes.data) return "N/A";
    const data = issueRes.data;
    if (data.remainTime !== undefined && data.remainTime !== null) {
      const secs = parseInt(data.remainTime) || 0;
      if (secs > 0) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
    }
    return "N/A";
  } catch (e) { return "N/A"; }
}

function formatManualResultsPage(results, page, timeLeftStr) {
  const pageResults = results.slice((page - 1) * 10, (page - 1) * 10 + 10);
  let msg = `${EMOJI.RESULTSBS} *Game Results (Page ${page}/2)*\n`;
  msg += `⏳ *Next Draw In: ${timeLeftStr}*\n`;
  msg += `${STYLE.SEPARATOR}\n`;
  pageResults.forEach(r => {
    const num = parseInt(r.number) % 10;
    const bs = num >= 5 ? 'B' : 'S';
    const color = numberToColor(num);
    const colorEmoji = color === 'G' ? '🟢' : color === 'R' ? '🔴' : '🟣';
    const period = String(r.issueNumber || '').slice(-10);
    msg += `${colorEmoji} \`${period}\` → *${num}* (${bs})\n`;
  });
  return msg;
}

function makeManualResPageKeyboard(currentPage) {
  const buttons = [];
  const row = [];
  if (currentPage > 1) row.push(Markup.button.callback("◀️ Prev", `manual_res_page_${currentPage - 1}`));
  row.push(Markup.button.callback(`${currentPage} / 2`, `manual_res_page_none`));
  if (currentPage < 2) row.push(Markup.button.callback("Next ▶️", `manual_res_page_${currentPage + 1}`));
  buttons.push(row);
  return Markup.inlineKeyboard(buttons);
}

async function sendMessageWithRetry(ctx, text, replyMarkup = null) {
  for (let attempt = 0; attempt < MAX_TELEGRAM_RETRIES; attempt++) {
    try {
      const options = { parse_mode: 'Markdown' };
      if (replyMarkup) options.reply_markup = replyMarkup.reply_markup || replyMarkup;
      await ctx.reply(text, options);
      return true;
    } catch (error) {
      if (attempt < MAX_TELEGRAM_RETRIES - 1) { await new Promise(r => setTimeout(r, TELEGRAM_RETRY_DELAY)); continue; }
      try {
        const plainText = text.replace(/\*/g, '').replace(/_/g, '').replace(/`/g, '');
        await ctx.reply(plainText, replyMarkup);
        return true;
      } catch (e) { return false; }
    }
  }
  return false;
}

async function checkProfitAndStopLoss(userId, bot) {
  const settings = userSettings[userId] || {};
  const targetProfit = settings.target_profit;
  const stopLossLimit = settings.stop_loss;
  if (["COLOR_SNIPER"].includes(settings.strategy)) return false;
  if (!targetProfit && !stopLossLimit) return false;
  let currentProfit, balance;
  if (settings.virtual_mode) {
    currentProfit = (userStats[userId].virtual_balance || 0) - (userStats[userId].initial_balance || 0);
    balance = userStats[userId].virtual_balance;
  } else {
    currentProfit = userStats[userId].profit || 0;
    balance = await getBalance(userSessions[userId], parseInt(userId));
  }
  let username = '';
  try { const chat = await bot.telegram.getChat(userId); username = chat.username ? `@${chat.username}` : ''; } catch (error) {}
  if (targetProfit && currentProfit >= targetProfit) {
    settings.running = false;
    delete userWaitingForResult[userId];
    delete userShouldSkipNext[userId];
    settings.martin_index = 0; settings.dalembert_units = 1; settings.custom_index = 0;
    settings.profit_target_reached = true;
    const balanceLabel = settings.virtual_mode ? 'Virtual Balance' : 'Balance';
    const msg = `Hey!! ${username}\n🎯 🔥 TARGET ACHIEVED 🔥\n${STYLE.SEPARATOR}\n${STYLE.ITEM(`Target: ${targetProfit} Ks`)}\n${STYLE.ITEM(`Profit: +${currentProfit.toFixed(2)} Ks`)}\n${STYLE.LAST_ITEM(`${balanceLabel}: ${balance?.toFixed(2) || '0.00'} Ks`)}`;
    const restartKeyboard = Markup.inlineKeyboard([Markup.button.callback(`${EMOJI.START} RESTART`, `restart_bot:${userId}`)]);
    await bot.telegram.sendMessage(userId, msg, { reply_markup: restartKeyboard.reply_markup });
    return true;
  }
  if (stopLossLimit && currentProfit <= -stopLossLimit) {
    settings.running = false;
    delete userWaitingForResult[userId];
    delete userShouldSkipNext[userId];
    settings.martin_index = 0; settings.dalembert_units = 1; settings.custom_index = 0;
    settings.stop_loss_reached = true;
    const balanceLabel = settings.virtual_mode ? 'Virtual Balance' : 'Balance';
    const msg = `Hey!! ${username}\n⏸️ 🔥 STOP LOSS HIT 🔥\n${STYLE.SEPARATOR}\n${STYLE.ITEM(`Limit: ${stopLossLimit} Ks`)}\n${STYLE.ITEM(`Loss: ${Math.abs(currentProfit).toFixed(2)} Ks`)}\n${STYLE.LAST_ITEM(`${balanceLabel}: ${balance?.toFixed(2) || '0.00'} Ks`)}`;
    const restartKeyboard = Markup.inlineKeyboard([Markup.button.callback(`${EMOJI.START} RESTART`, `restart_bot:${userId}`)]);
    await bot.telegram.sendMessage(userId, msg, { reply_markup: restartKeyboard.reply_markup });
    return true;
  }
  return false;
}

function ensureUserStatsInitialized(userId) {
  if (!userStats[userId]) {
    const settings = userSettings[userId] || {};
    userStats[userId] = {
      start_balance: 0, profit: 0,
      virtual_balance: settings.virtual_mode ? (settings.virtual_balance || 0) : 0,
      initial_balance: settings.virtual_mode ? (settings.virtual_balance || 0) : 0,
      daily_date: new Date().toDateString(),
      daily_wins: 0, daily_losses: 0, daily_profit: 0, daily_start_balance: 0
    };
  }
}

function safeGetUserStats(userId) {
  if (!userStats[userId]) {
    const settings = userSettings[userId] || {};
    userStats[userId] = {
      start_balance: 0, profit: 0,
      virtual_balance: settings.virtual_mode ? (settings.virtual_balance || 0) : 0,
      initial_balance: settings.virtual_mode ? (settings.virtual_balance || 0) : 0,
      daily_date: new Date().toDateString(),
      daily_wins: 0, daily_losses: 0, daily_profit: 0, daily_start_balance: 0
    };
  } else if (!userStats[userId].daily_date) {
    userStats[userId].daily_date = new Date().toDateString();
    userStats[userId].daily_wins = 0; userStats[userId].daily_losses = 0;
    userStats[userId].daily_profit = 0; userStats[userId].daily_start_balance = 0;
  }
  return userStats[userId];
}

// ===== STRATEGIES =====
function getColorSniperPrediction(userId) {
  const state = userSettings[userId].color_sniper_state || { active: false, step: 0, hit_count: 0, waiting_for_trigger: true };
  const lastNumbers = userLastResults[userId] || [];
  const lastNumStr = lastNumbers.length > 0 ? lastNumbers[lastNumbers.length - 1] : null;
  if (!state.active && state.waiting_for_trigger && lastNumStr) {
    if (lastNumStr === "1" || lastNumStr === "7") { state.active = true; state.waiting_for_trigger = false; state.step = 0; state.hit_count = 0; }
  }
  userSettings[userId].color_sniper_state = state;
  return state.active ? { choice: 'R', shouldSkip: false } : { choice: 'R', shouldSkip: true };
}

function getTrendFollowPrediction(userId) {
  const settings = userSettings[userId] || {};
  const betType = settings.bet_type || "BS";
  if (betType === "COLOR") {
    if (!settings.color_trend_state) settings.color_trend_state = { last_result: null };
    if (settings.color_trend_state.last_result === null) {
      const colors = ['G', 'V', 'R'];
      return { choice: colors[Math.floor(Math.random() * colors.length)], shouldSkip: false };
    }
    return { choice: settings.color_trend_state.last_result, shouldSkip: false };
  } else {
    if (!settings.trend_state) settings.trend_state = { last_result: null, skip_mode: false };
    const bsWaitCount = settings.bs_sb_wait_count || 0;
    let shouldSkip = false;
    if (bsWaitCount > 0) {
      const requiredResults = 2 * bsWaitCount;
      const results = userAllResults[userId] || [];
      if (results.length >= requiredResults) {
        const lastResults = results.slice(-requiredResults);
        const patternBS = 'BS'.repeat(bsWaitCount);
        const patternSB = 'SB'.repeat(bsWaitCount);
        const actualPattern = lastResults.join('');
        if (actualPattern === patternBS || actualPattern === patternSB) {
          shouldSkip = true;
          settings.trend_state.skip_mode = true;
        } else settings.trend_state.skip_mode = false;
      }
    }
    if (settings.trend_state.skip_mode) return { choice: settings.trend_state.last_result || 'B', shouldSkip: true };
    if (settings.trend_state.last_result === null) return { choice: 'B', shouldSkip: false };
    return { choice: settings.trend_state.last_result, shouldSkip: false };
  }
}

function getAlternatePrediction(userId) {
  const settings = userSettings[userId] || {};
  if (!settings.alternate_state) settings.alternate_state = { last_result: null, skip_mode: false };
  const bbWaitCount = settings.bb_ss_wait_count || 0;
  let shouldSkip = false;
  if (bbWaitCount > 0) {
    const requiredResults = 2 * bbWaitCount;
    const results = userAllResults[userId] || [];
    if (results.length >= requiredResults) {
      const lastResults = results.slice(-requiredResults);
      const patternBB = 'BB'.repeat(bbWaitCount);
      const patternSS = 'SS'.repeat(bbWaitCount);
      const actualPattern = lastResults.join('');
      if (actualPattern === patternBB || actualPattern === patternSS) {
        shouldSkip = true;
        settings.alternate_state.skip_mode = true;
      } else settings.alternate_state.skip_mode = false;
    }
  }
  if (settings.alternate_state.skip_mode) {
    let prediction = settings.alternate_state.last_result === null ? 'B' : (settings.alternate_state.last_result === 'B' ? 'S' : 'B');
    return { choice: prediction, shouldSkip: true };
  }
  if (settings.alternate_state.last_result === null) return { choice: 'B', shouldSkip: false };
  return { choice: settings.alternate_state.last_result === 'B' ? 'S' : 'B', shouldSkip: false };
}

function getBsOrderPrediction(userId) {
  const settings = userSettings[userId] || {};
  if (!settings.pattern) { settings.pattern = DEFAULT_BS_ORDER; settings.pattern_index = 0; }
  const pattern = settings.pattern;
  let patternIndex = settings.pattern_index || 0;
  if (patternIndex >= pattern.length) { patternIndex = 0; settings.pattern_index = 0; }
  const prediction = pattern[patternIndex];
  settings.pattern_index = (patternIndex + 1) % pattern.length;
  return { choice: prediction, shouldSkip: false };
}

// ===== LEO STRATEGY =====
async function getLeoPrediction(userId, settings) {
  if (!settings.leo_state) {
    settings.leo_state = { last_result: null, pattern_index: 0 };
  }
  if (settings.leo_state.last_result === null) {
    return { prediction: 'B' };
  } else {
    const pattern = settings.leo_state.last_result === 'B' ? LEO_BIG_PATTERN : LEO_SMALL_PATTERN;
    const prediction = pattern[settings.leo_state.pattern_index % pattern.length];
    return { prediction };
  }
}

function updateLeoState(settings, bigSmall) {
  if (settings.leo_state) {
    settings.leo_state.last_result = bigSmall;
    const patternLength = bigSmall === 'B' ? LEO_BIG_PATTERN.length : LEO_SMALL_PATTERN.length;
    settings.leo_state.pattern_index = (settings.leo_state.pattern_index + 1) % patternLength;
  }
}

// ===== DREAM STRATEGY =====
async function getDreamPrediction(userId, settings) {
  if (!settings.dream_state) {
    settings.dream_state = { first_bet: true, current_pattern: "", current_index: 0 };
  }
  const dreamState = settings.dream_state;
  if (dreamState.first_bet) {
    return { prediction: 'B' };
  } else if (dreamState.current_pattern && dreamState.current_index < dreamState.current_pattern.length) {
    return { prediction: dreamState.current_pattern[dreamState.current_index] };
  } else {
    return { prediction: 'B' };
  }
}

function updateDreamState(settings, isWin, resultNumber) {
  const dreamState = settings.dream_state;
  if (!dreamState) return;
  if (dreamState.first_bet) {
    dreamState.first_bet = false;
    dreamState.current_pattern = dreamPatterns[resultNumber.toString()] || dreamPatterns["0"];
    dreamState.current_index = 0;
  } else {
    if (isWin) {
      dreamState.current_pattern = dreamPatterns[resultNumber.toString()] || dreamPatterns["0"];
      dreamState.current_index = 0;
    } else {
      dreamState.current_index = (dreamState.current_index + 1) % dreamState.current_pattern.length;
    }
  }
}

// ===== CHAT GPT V1 STRATEGY =====
async function getAIPrediction(userId, gameType) {
  try {
    if (!userAILast10Results[userId]) {
      userAILast10Results[userId] = [];
    }
    if (!userAIRoundCount[userId]) {
      userAIRoundCount[userId] = 0;
    }
    
    userAIRoundCount[userId]++;
    
    if (userAILast10Results[userId].length === 0) {
      return { result: 'B', percent: '50.0' };
    }
    
    const availableResults = userAILast10Results[userId].slice(-10);
    
    if (availableResults.length >= 3) {
      const lastThree = availableResults.slice(-3).join('');
      
      if (lastThree === 'BBB') {
        return { result: 'S', percent: '70.0' };
      } else if (lastThree === 'SSS') {
        return { result: 'B', percent: '70.0' };
      }
    }
    
    const counts = { B: 0, S: 0 };
    for (const result of availableResults) {
      counts[result]++;
    }
    
    let prediction;
    if (counts.B > counts.S) {
      prediction = 'B';
    } else if (counts.S > counts.B) {
      prediction = 'S';
    } else {
      prediction = availableResults[availableResults.length - 1];
    }
    
    const diff = Math.abs(counts.B - counts.S);
    const confidence = 50 + (diff * 5);
    const percent = Math.min(confidence, 95).toFixed(1);
    
    return { result: prediction, percent };
  } catch (error) {
    return { result: 'B', percent: '50.0' };
  }
}
// =========================

async function terminateSniperSession(userId, strategyName, bot, isHitTermination) {
  const settings = userSettings[userId] || {};
  settings.running = false;
  delete userWaitingForResult[userId];
  delete userShouldSkipNext[userId];
  settings.martin_index = 0; settings.dalembert_units = 1; settings.custom_index = 0;
  const isVirtual = settings.virtual_mode || false;
  let balance = 0, profit = 0;
  if (isVirtual) {
    const startAmount = userStats[userId]?.initial_balance || 0;
    balance = userStats[userId]?.virtual_balance || 0;
    profit = balance - startAmount;
  } else {
    profit = userStats[userId]?.profit || 0;
    balance = await getBalance(userSessions[userId], parseInt(userId)) || 0;
  }
  const caption = isHitTermination 
    ? `🎯 ${STYLE.BOLD('SNIPER MISSION COMPLETE!')}\n${STYLE.SEPARATOR}\n${STYLE.ITEM(`Target Hits: ${SNIPER_MAX_HITS}`)}\n${STYLE.ITEM(`Actual Hits: ${settings.sniper_hit_count || 0}`)}\n${STYLE.ITEM(`Losses: ${settings.sniper_loss_count || 0}`)}\n${STYLE.LAST_ITEM('🎉 Target acquired successfully!')}`
    : `🛑 ${STYLE.BOLD('SNIPER MAX LOSSES REACHED')}\n${STYLE.SEPARATOR}\n${STYLE.ITEM(`Target Hits: ${SNIPER_MAX_HITS}`)}\n${STYLE.ITEM(`Actual Hits: ${settings.sniper_hit_count || 0}`)}\n${STYLE.ITEM(`Max Losses: ${SNIPER_MAX_LOSSES}`)}\n${STYLE.LAST_ITEM('⚠️ Session terminated')}`;
  const restartKeyboard = Markup.inlineKeyboard([Markup.button.callback(`${EMOJI.START} RESTART`, `restart_bot:${userId}`)]);
  await bot.telegram.sendMessage(userId, caption, { parse_mode: 'Markdown', reply_markup: restartKeyboard.reply_markup });
  delete settings.sniper_hit_count;
  delete settings.sniper_loss_count;
}

async function winLoseChecker(bot) {
  logging.info("Win/lose checker started");
  while (true) {
    try {
      for (const [userId, session] of Object.entries(userSessions)) {
        if (!session) continue;
        const settings = userSettings[userId] || {};
        
        if (!settings.running && 
            (!userPendingBets[userId] || Object.keys(userPendingBets[userId]).length === 0) &&
            (!userSkippedBets[userId] || Object.keys(userSkippedBets[userId]).length === 0) &&
            (!userManualBets[userId] || userManualBets[userId].length === 0)) {
          continue;
        }
        
        if (!userStats[userId]) {
          userStats[userId] = {
            start_balance: 0, profit: 0,
            virtual_balance: settings.virtual_mode ? (settings.virtual_balance || 0) : 0,
            initial_balance: settings.virtual_mode ? (settings.virtual_balance || 0) : 0,
            daily_date: new Date().toDateString(),
            daily_wins: 0, daily_losses: 0, daily_profit: 0, daily_start_balance: 0
          };
        }
        
        const gameType = settings.game_type || "WINGO";
        const betType = settings.bet_type || "BS";
        let data;
        
        if (gameType.startsWith("WINGO")) {
          const wingoRes = await getWingoGameResults(session, gameType);
          if (!wingoRes || wingoRes.code !== 0) continue;
          data = wingoRes.data?.list || [];
        } else {
          let issueRes = await getGameIssueRequest(session, gameType);
          if (!issueRes || issueRes.code !== 0) continue;
          data = issueRes.data ? [issueRes.data.settled || {}] : [];
        }
        
        if (gameType.startsWith("WINGO")) {
          if (!userAllResults[userId]) userAllResults[userId] = [];
          if (!userLastResults[userId]) userLastResults[userId] = [];
          for (let i = 0; i < Math.min(data.length, 10); i++) {
            const result = data[i];
            if (result && result.number) {
              const number = parseInt(result.number || "0") % 10;
              const bigSmall = number >= 5 ? "B" : "S";
              if (!userAllResults[userId].includes(bigSmall)) {
                userAllResults[userId].push(bigSmall);
                if (userAllResults[userId].length > 20) userAllResults[userId] = userAllResults[userId].slice(-20);
              }
            }
          }
        }
        
        if (userPendingBets[userId]) {
          for (const [period, betInfo] of Object.entries(userPendingBets[userId])) {
            const settled = data.find(item => item.issueNumber === period);
            if (settled && settled.number) {
              const [betChoice, amount, isVirtual] = betInfo;
              const number = parseInt(settled.number || "0") % 10;
              const bigSmall = number >= 5 ? "B" : "S";
              const color = numberToColor(number);
              let isWin;
              if (betType === "COLOR") isWin = betChoice === color;
              else isWin = (betChoice === "B" && bigSmall === "B") || (betChoice === "S" && bigSmall === "S");
              
              if (!userLastResults[userId]) userLastResults[userId] = [];
              userLastResults[userId].push(number.toString());
              if (userLastResults[userId].length > 10) userLastResults[userId] = userLastResults[userId].slice(-10);
              if (!userAllResults[userId]) userAllResults[userId] = [];
              userAllResults[userId].push(bigSmall);
              if (userAllResults[userId].length > 20) userAllResults[userId] = userAllResults[userId].slice(-20);
              
              if (settings.strategy === "COLOR_SNIPER" && settings.color_sniper_state) {
                const csState = settings.color_sniper_state;
                if (settings.sniper_hit_count === undefined) settings.sniper_hit_count = 0;
                if (settings.sniper_loss_count === undefined) settings.sniper_loss_count = 0;
                if (isWin) {
                  settings.sniper_hit_count++;
                  csState.hit_count = (csState.hit_count || 0) + 1;
                  if (settings.sniper_hit_count >= SNIPER_MAX_HITS) {
                    await terminateSniperSession(userId, 'COLOR SNIPER', bot, true);
                    settings.running = false;
                    csState.active = false;
                  } else { csState.active = false; csState.waiting_for_trigger = true; csState.step = 0; }
                } else {
                  settings.sniper_loss_count++;
                  if (settings.sniper_loss_count >= SNIPER_MAX_LOSSES) {
                    await terminateSniperSession(userId, 'COLOR SNIPER', bot, false);
                    settings.running = false;
                    csState.active = false;
                  } else {
                    csState.step++;
                    if (csState.step >= 4) { settings.running = false; csState.active = false; }
                  }
                }
              }

              if (settings.strategy === "TREND_FOLLOW") {
                if (betType === "COLOR") {
                  if (!settings.color_trend_state) settings.color_trend_state = { last_result: null };
                  settings.color_trend_state.last_result = color;
                } else {
                  if (!settings.trend_state) settings.trend_state = { last_result: null, skip_mode: false };
                  settings.trend_state.last_result = bigSmall;
                }
              }
              
              if (settings.strategy === "ALTERNATE") {
                if (!settings.alternate_state) settings.alternate_state = { last_result: null, skip_mode: false };
                settings.alternate_state.last_result = bigSmall;
                if (settings.alternate_state.skip_mode && isWin) settings.alternate_state.skip_mode = false;
              }

              if (settings.strategy === "LEO") {
                updateLeoState(settings, bigSmall);
              }

              if (settings.strategy === "DREAM") {
                updateDreamState(settings, isWin, number);
              }

              if (settings.strategy === "CHAT_GPT_V1") {
                if (!userAILast10Results[userId]) userAILast10Results[userId] = [];
                userAILast10Results[userId].push(bigSmall);
                if (userAILast10Results[userId].length > 10) userAILast10Results[userId] = userAILast10Results[userId].slice(-10);
              }
              
              const entryLayer = settings.layer_limit || 1;
              if (entryLayer === 2) {
                if (!settings.entry_layer_state) settings.entry_layer_state = { waiting_for_lose: true };
                if (settings.entry_layer_state.waiting_for_lose && !isWin) settings.entry_layer_state.waiting_for_lose = false;
              } else if (entryLayer === 3) {
                if (!settings.entry_layer_state) settings.entry_layer_state = { waiting_for_loses: true, consecutive_loses: 0 };
                if (settings.entry_layer_state.waiting_for_loses) {
                  if (isWin) settings.entry_layer_state.consecutive_loses = 0;
                  else {
                    settings.entry_layer_state.consecutive_loses++;
                    if (settings.entry_layer_state.consecutive_loses >= 2) settings.entry_layer_state.waiting_for_loses = false;
                  }
                }
              }
              
              if (settings.sl_layer && settings.sl_layer > 0) {
                if (isWin) {
                  settings.consecutive_losses = 0;
                  userShouldSkipNext[userId] = false;
                  if (userSLSkipWaitingForWin[userId]) delete userSLSkipWaitingForWin[userId];
                  updateBettingStrategy(settings, true, amount);
                } else {
                  settings.consecutive_losses = (settings.consecutive_losses || 0) + 1;
                  updateBettingStrategy(settings, false, amount);
                  if (settings.consecutive_losses >= settings.sl_layer) {
                    settings.skip_betting = true;
                    userShouldSkipNext[userId] = true;
                    userSLSkipWaitingForWin[userId] = true;
                  }
                }
              } else updateBettingStrategy(settings, isWin, amount);
              
              if (isVirtual) {
                if (!userStats[userId].virtual_balance) userStats[userId].virtual_balance = settings.virtual_balance || 0;
                if (isWin) userStats[userId].virtual_balance += amount * 0.96;
                else userStats[userId].virtual_balance -= amount;
              } else {
                if (userStats[userId] && amount > 0) {
                  if (isWin) userStats[userId].profit += amount * 0.96;
                  else userStats[userId].profit -= amount;
                }
              }
              
              const todayStr = new Date().toDateString();
              if (userStats[userId].daily_date !== todayStr) {
                userStats[userId].daily_date = todayStr;
                userStats[userId].daily_wins = 0;
                userStats[userId].daily_losses = 0;
                userStats[userId].daily_profit = 0;
              }
              if (isWin) {
                userStats[userId].daily_wins++;
                userStats[userId].daily_profit += amount * 0.96;
              } else {
                userStats[userId].daily_losses++;
                userStats[userId].daily_profit -= amount;
              }
              
              const currentBalance = isVirtual ? userStats[userId].virtual_balance : await getBalance(session, parseInt(userId));
              await checkProfitAndStopLoss(userId, bot);
              
              let resultText;
              if (betType === "COLOR") resultText = `${EMOJI.RESULT} Result: ${number} → ${getColorName(color)} (${bigSmall === 'B' ? 'Big' : 'Small'})`;
              else resultText = `${EMOJI.RESULT} Result: ${number} → ${bigSmall === 'B' ? 'Big' : 'Small'}`;
              
              const gameId = `${EMOJI.GAME} ${escapeMarkdown(gameType)} : ${period}`;
              let message;
              if (isWin) {
                const totalProfit = isVirtual ? (userStats[userId].virtual_balance - (userStats[userId].initial_balance || 0)) : (userStats[userId]?.profit || 0);
                message = `${EMOJI.WIN} ${STYLE.BOLD('VICTORY')} +${(amount * 0.96).toFixed(2)} Ks\n${STYLE.SEPARATOR}\n${gameId}\n${resultText}\n${EMOJI.BALANCE} Balance: ${currentBalance?.toFixed(2) || '0.00'} Ks\n${EMOJI.PROFIT} Total Profit: ${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)} Ks`;
              } else {
                const totalProfit = isVirtual ? (userStats[userId].virtual_balance - (userStats[userId].initial_balance || 0)) : (userStats[userId]?.profit || 0);
                let slStatusLine = '';
                if (settings.sl_layer) slStatusLine = `${EMOJI.WARNING} Consecutive Losses: ${settings.consecutive_losses || 0}/${settings.sl_layer}\n`;
                message = `${EMOJI.LOSS} ${STYLE.BOLD('LOSS')} -${amount} Ks\n${STYLE.SEPARATOR}\n${gameId}\n${resultText}\n${slStatusLine}${EMOJI.BALANCE} Balance: ${currentBalance?.toFixed(2) || '0.00'} Ks\n${EMOJI.LOSS_ICON} Total Profit: ${totalProfit >= 0 ? '+' : ''}${totalProfit.toFixed(2)} Ks`;
              }
              
              try { await bot.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' }); } catch (error) {}
              
              delete userPendingBets[userId][period];
              if (Object.keys(userPendingBets[userId]).length === 0) delete userPendingBets[userId];
              userWaitingForResult[userId] = false;
            }
          }
        }
        
        if (userSkippedBets[userId]) {
          for (const [period, betInfo] of Object.entries(userSkippedBets[userId])) {
            const settled = data.find(item => item.issueNumber === period);
            if (settled && settled.number) {
              const [betChoice, isVirtual, isZeroSkip] = betInfo;
              const number = parseInt(settled.number || "0") % 10;
              const bigSmall = number >= 5 ? "B" : "S";
              const color = numberToColor(number);
              let isWin;
              if (betType === "COLOR") isWin = betChoice === color;
              else isWin = (betChoice === "B" && bigSmall === "B") || (betChoice === "S" && bigSmall === "S");
              
              if (!userLastResults[userId]) userLastResults[userId] = [];
              userLastResults[userId].push(number.toString());
              if (userLastResults[userId].length > 10) userLastResults[userId] = userLastResults[userId].slice(-10);
              if (!userAllResults[userId]) userAllResults[userId] = [];
              userAllResults[userId].push(bigSmall);
              if (userAllResults[userId].length > 20) userAllResults[userId] = userAllResults[userId].slice(-20);
              
              // [FIXED] Strategy state update should happen even if it's a 0 skip, 
              // because the game result still happened and the bot needs to track the trend.
              if (settings.strategy === "TREND_FOLLOW") {
                if (betType === "COLOR") {
                  if (!settings.color_trend_state) settings.color_trend_state = { last_result: null };
                  settings.color_trend_state.last_result = color;
                } else {
                  if (!settings.trend_state) settings.trend_state = { last_result: null, skip_mode: false };
                  settings.trend_state.last_result = bigSmall;
                  if (settings.trend_state.skip_mode && isWin) settings.trend_state.skip_mode = false;
                }
              }
              
              if (settings.strategy === "ALTERNATE") {
                if (!settings.alternate_state) settings.alternate_state = { last_result: null, skip_mode: false };
                settings.alternate_state.last_result = bigSmall;
                if (settings.alternate_state.skip_mode && isWin) settings.alternate_state.skip_mode = false;
              }

              if (settings.strategy === "LEO") {
                updateLeoState(settings, bigSmall);
              }

              if (settings.strategy === "DREAM") {
                updateDreamState(settings, isWin, number);
              }

              if (settings.strategy === "CHAT_GPT_V1") {
                if (!userAILast10Results[userId]) userAILast10Results[userId] = [];
                userAILast10Results[userId].push(bigSmall);
                if (userAILast10Results[userId].length > 10) userAILast10Results[userId] = userAILast10Results[userId].slice(-10);
              }
              
              // [FIXED] Only reset SL skip waiting if it was NOT a zero skip. 
              if (!isZeroSkip) {
                if (settings.sl_layer && settings.sl_layer > 0 && userSLSkipWaitingForWin[userId] && isWin) {
                  userShouldSkipNext[userId] = false;
                  settings.skip_betting = false;
                  settings.consecutive_losses = 0;
                  delete userSLSkipWaitingForWin[userId];
                  const bettingStrategy = settings.betting_strategy || "Martingale";
                  if (bettingStrategy === "Martingale" || bettingStrategy === "Anti-Martingale") settings.martin_index = settings.original_martin_index || 0;
                  else if (bettingStrategy === "D'Alembert") settings.dalembert_units = settings.original_dalembert_units || 1;
                  else if (bettingStrategy === "Custom") settings.custom_index = settings.original_custom_index || 0;
                }
              }
              
              let resultText;
              if (betType === "COLOR") resultText = `${EMOJI.RESULT} Result: ${number} → ${getColorName(color)} (${bigSmall === 'B' ? 'Big' : 'Small'})`;
              else resultText = `${EMOJI.RESULT} Result: ${number} → ${bigSmall === 'B' ? 'Big' : 'Small'}`;
              
              try { await bot.telegram.sendMessage(userId, resultText, { parse_mode: 'Markdown' }); } catch (error) {}
              
              delete userSkippedBets[userId][period];
              if (Object.keys(userSkippedBets[userId]).length === 0) delete userSkippedBets[userId];
              if (userSkipResultWait[userId] === period) delete userSkipResultWait[userId];
            }
          }
        }

        if (userManualBets[userId] && data.length > 0) {
          for (let i = 0; i < userManualBets[userId].length; i++) {
            const bet = userManualBets[userId][i];
            if (bet.status === "PENDING" && bet.period) {
              const settled = data.find(item => item.issueNumber === bet.period);
              if (settled && settled.number) {
                const number = parseInt(settled.number) % 10;
                const bigSmall = number >= 5 ? "B" : "S";
                const color = numberToColor(number);
                let isWin;
                if (bet.betType === "COLOR") isWin = (bet.choice === color);
                else isWin = (bet.choice === "B" && bigSmall === "B") || (bet.choice === "S" && bigSmall === "S");
                const profit = isWin ? (bet.amount * 0.96) : -bet.amount;
                bet.status = isWin ? "WIN" : "LOSS";
                bet.result = `${number}(${bigSmall}/${color})`;
                bet.isWin = isWin;
                bet.profit = profit;
                
                let choiceText;
                if (bet.choice === 'B') choiceText = 'BIG';
                else if (bet.choice === 'S') choiceText = 'SMALL';
                else if (bet.choice === 'G') choiceText = 'GREEN 🟢';
                else if (bet.choice === 'R') choiceText = 'RED 🔴';
                else if (bet.choice === 'V') choiceText = 'VIOLET 🟣';
                else choiceText = bet.choice;
                
                const gameId = `${EMOJI.GAME} ${escapeMarkdown(gameType)} : ${bet.period}`;
                const colorEmoji = color === 'G' ? '🟢' : color === 'R' ? '🔴' : '🟣';
                const resultText = bet.betType === "COLOR"
                  ? `${EMOJI.RESULT} Result: ${number} ${colorEmoji} ${getColorName(color)}`
                  : `${EMOJI.RESULT} Result: ${number} → ${bigSmall === 'B' ? 'Big' : 'Small'}`;
                
                let message;
                if (isWin) {
                  message = `${EMOJI.WIN} ${STYLE.BOLD('MANUAL BET VICTORY')} +${(bet.amount * 0.96).toFixed(2)} Ks\n${STYLE.SEPARATOR}\n${gameId}\n${resultText}\nBet: ${choiceText} | ${bet.amount} Ks`;
                } else {
                  message = `${EMOJI.LOSS} ${STYLE.BOLD('MANUAL BET LOSS')} -${bet.amount.toFixed(2)} Ks\n${STYLE.SEPARATOR}\n${gameId}\n${resultText}\nBet: ${choiceText} | ${bet.amount} Ks`;
                }
                try { await bot.telegram.sendMessage(userId, message, { parse_mode: 'Markdown' }); } catch (error) {}
              }
            }
          }
        }
      }
      
      await new Promise(r => setTimeout(r, WIN_LOSE_CHECK_INTERVAL * 1000));
    } catch (error) {
      logging.error(`Win/lose checker error: ${error.message}`);
      await new Promise(r => setTimeout(r, 10000));
    }
  }
}

function getBetIndexEmoji(settings) {
  const bettingStrategy = settings.betting_strategy || "Martingale";
  let betIndex = 0;
  if (bettingStrategy === "Martingale" || bettingStrategy === "Anti-Martingale") betIndex = settings.martin_index || 0;
  else if (bettingStrategy === "Custom") betIndex = settings.custom_index || 0;
  else if (bettingStrategy === "D'Alembert") betIndex = (settings.dalembert_units || 1) - 1;
  return betIndex === 0 ? "🔺" : "🔻";
}

async function safeDeleteMessage(ctx, messageId = null) {
  try {
    const msgId = messageId || ctx.callbackQuery?.message?.message_id;
    if (msgId) await ctx.deleteMessage(msgId);
  } catch (error) {}
}

async function bettingWorker(userId, ctx, bot) {
  const settings = userSettings[userId] || {};
  let session = userSessions[userId];
  ensureUserStatsInitialized(userId);

  if (!settings || !session) {
    await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Please login first`, makeMainKeyboard(false, isAdmin(userId)));
    settings.running = false;
    return;
  }
  
  settings.running = true;
  settings.last_issue = null;
  settings.consecutive_errors = 0;
  settings.consecutive_losses = 0;
  settings.current_layer = 0;
  settings.skip_betting = false;
  
  if (settings.strategy === "COLOR_SNIPER") {
    settings.color_sniper_state = { active: false, step: 0, hit_count: 0, waiting_for_trigger: true };
    userLastResults[userId] = [];
    settings.sniper_hit_count = 0;
    settings.sniper_loss_count = 0;
  }
  
  if (settings.original_martin_index === undefined) settings.original_martin_index = 0;
  if (settings.original_dalembert_units === undefined) settings.original_dalembert_units = 1;
  if (settings.original_custom_index === undefined) settings.original_custom_index = 0;
  
  userShouldSkipNext[userId] = false;
  delete userSLSkipWaitingForWin[userId];
  
  const entryLayer = settings.layer_limit || 1;
  const betType = settings.bet_type || "BS";
  
  if (entryLayer === 2) settings.entry_layer_state = { waiting_for_lose: true };
  else if (entryLayer === 3) settings.entry_layer_state = { waiting_for_loses: true, consecutive_loses: 0 };
  
  if (settings.strategy === "TREND_FOLLOW") {
    if (betType === "COLOR") settings.color_trend_state = { last_result: null };
    else settings.trend_state = { last_result: null, skip_mode: false };
  }
  if (settings.strategy === "ALTERNATE") settings.alternate_state = { last_result: null, skip_mode: false };
  
  if (settings.strategy === "BS_ORDER") {
    if (!settings.pattern || settings.pattern.length === 0) {
      settings.pattern = DEFAULT_BS_ORDER;
      settings.pattern_index = 0;
    }
    settings.pattern_index = 0;
  }

  if (settings.strategy === "LEO") {
    settings.leo_state = { last_result: null, pattern_index: 0 };
  }

  if (settings.strategy === "DREAM") {
    settings.dream_state = { first_bet: true, current_pattern: "", current_index: 0 };
  }

  if (settings.strategy === "CHAT_GPT_V1") {
    userAILast10Results[userId] = [];
    userAIRoundCount[userId] = 0;
  }
  
  if (!userLastResults[userId]) userLastResults[userId] = [];
  
  let currentBalance = null;
  if (settings.virtual_mode) {
    currentBalance = userStats[userId].virtual_balance || settings.virtual_balance || 0;
  } else {
    let balanceRetrieved = false;
    for (let attempt = 0; attempt < MAX_BALANCE_RETRIES; attempt++) {
      try {
        const balanceResult = await getBalance(session, parseInt(userId));
        if (balanceResult !== null) {
          currentBalance = balanceResult;
          userStats[userId].start_balance = currentBalance;
          balanceRetrieved = true;
          break;
        }
      } catch (error) {}
      if (attempt < MAX_BALANCE_RETRIES - 1) await new Promise(r => setTimeout(r, BALANCE_RETRY_DELAY * 1000));
    }
    if (!balanceRetrieved) {
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Failed to check balance. Please try again.`, makeMainKeyboard(true, isAdmin(userId)));
      settings.running = false;
      return;
    }
  }
  
  const safeEscape = (text) => text === null || text === undefined ? '' : String(text).replace(/[*_`\\[\]()~>#+\-=|{}.!]/g, '\\$&');
  
  let strategyText = settings.strategy === "TREND_FOLLOW" ? "Trend Follow" :
                     settings.strategy === "ALTERNATE" ? "Alternate" :
                     settings.strategy === "BS_ORDER" ? "Bs Order" :
                     settings.strategy === "COLOR_SNIPER" ? "Color Sniper" :
                     settings.strategy === "LEO" ? "🫟 LEO" :
                     settings.strategy === "DREAM" ? "🦅 Dream" :
                     settings.strategy === "CHAT_GPT_V1" ? "✮⋆˙ CHAT GPT V1" :
                     safeEscape(settings.strategy);

  if (settings.strategy === "TREND_FOLLOW") {
    const bsWaitCount = settings.bs_sb_wait_count || 0;
    if (bsWaitCount > 0) strategyText += ` (BS/SB Wait: ${bsWaitCount})`;
  }
  if (settings.strategy === "ALTERNATE") {
    const bbWaitCount = settings.bb_ss_wait_count || 0;
    if (bbWaitCount > 0) strategyText += ` (BB/SS Wait: ${bbWaitCount})`;
  }

  const bettingStrategyText = settings.betting_strategy === "Martingale" ? "Martingale" :
                            settings.betting_strategy === "Anti-Martingale" ? "Anti-Martingale" :
                            settings.betting_strategy === "D'Alembert" ? "D'Alembert" :
                            settings.betting_strategy === "Custom" ? "Custom" : safeEscape(settings.betting_strategy);

  const profitTargetText = settings.target_profit ? `${settings.target_profit} Ks` : "Not Set";
  const stopLossText = settings.stop_loss ? `${settings.stop_loss} Ks` : "Not Set";
  const gameType = settings.game_type || "WINGO";
  const betTypeText = settings.bet_type === "COLOR" ? "Color" : "Big/Small";
  const platformKey = settings.platform || "6LOTTERY";
  const platformColor = PLATFORMS[platformKey]?.color || "🔴";

  const startMessage = 
    `${EMOJI.START} *BOT ACTIVATED*\n${STYLE.SEPARATOR}\n\n` +
    `${platformColor} Platform: ${safeEscape(platformKey)}\n` +
    `${EMOJI.BALANCE} Balance: ${currentBalance} Ks\n\n` +
    `${EMOJI.GAME} Game: ${safeEscape(gameType)}\n` +
    `${EMOJI.MODE} Type: ${safeEscape(betTypeText)}\n` +
    `${EMOJI.STRATEGY} Strategy: ${strategyText}\n` +
    `${EMOJI.SETTINGS} Mode: ${safeEscape(bettingStrategyText)}\n\n` +
    `${EMOJI.TARGET} Target: ${safeEscape(profitTargetText)}\n` +
    `${EMOJI.STOP} Stop Loss: ${safeEscape(stopLossText)}\n\n` +
    `${STYLE.SEPARATOR}\n${EMOJI.LOADING} Starting betting sequence...`;

  await sendMessageWithRetry(ctx, startMessage);
  
  try {
    while (settings.running) {
      if (userWaitingForResult[userId]) { await new Promise(r => setTimeout(r, 1000)); continue; }
      if (userSkipResultWait[userId]) { await new Promise(r => setTimeout(r, 1000)); continue; }

      if (settings.virtual_mode) {
        currentBalance = userStats[userId].virtual_balance || settings.virtual_balance || 0;
      } else {
        try {
          const balanceResult = await getBalance(session, parseInt(userId));
          if (balanceResult !== null) currentBalance = balanceResult;
        } catch (error) {}
      }
      
      if (currentBalance === null) {
        await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Failed to recover balance. Stopping...`, makeMainKeyboard(true, isAdmin(userId)));
        settings.running = false;
        break;
      }
      
      const betSizes = settings.bet_sizes || [];
      if (!betSizes.length) {
        await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Bet_Wragers not set.`);
        settings.running = false;
        break;
      }
      
      // [FIXED] Restored the Low Balance Check logic
      const validSizes = betSizes.filter(s => typeof s === 'number' && s > 0);
      const minBetSize = validSizes.length > 0 ? Math.min(...validSizes) : 10;
      
      if (currentBalance < minBetSize) {
        const message = `${EMOJI.WARNING} ${STYLE.BOLD('Low Balance!')}\n${STYLE.SEPARATOR}\n${STYLE.ITEM(`Current: ${currentBalance.toFixed(2)} Ks`)}\n${STYLE.LAST_ITEM(`Minimum: ${minBetSize} Ks`)}`;
        await sendMessageWithRetry(ctx, message, makeMainKeyboard(true, isAdmin(userId)));
        settings.running = false;
        break;
      }
      
      let issueRes;
      try {
        issueRes = await getGameIssueRequest(session, gameType);
        if (!issueRes || issueRes.code !== 0) {
          settings.consecutive_errors++;
          if (settings.consecutive_errors >= MAX_CONSECUTIVE_ERRORS) {
            await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Too many errors. Stopping.`);
            settings.running = false;
            break;
          }
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
      } catch (error) {
        settings.consecutive_errors++;
        if (settings.consecutive_errors >= MAX_CONSECUTIVE_ERRORS) { settings.running = false; break; }
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      
      settings.consecutive_errors = 0;
      
      let currentIssue;
      const data = issueRes.data || {};
      if (gameType === "TRX") currentIssue = data.predraw?.issueNumber;
      else currentIssue = data.issueNumber;
      
      if (!currentIssue || currentIssue === settings.last_issue) {
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      
      let ch, shouldSkip = false, skipReason = "";
      
      if (settings.strategy === "COLOR_SNIPER") {
        const prediction = getColorSniperPrediction(userId);
        ch = prediction.choice; shouldSkip = prediction.shouldSkip;
        if (shouldSkip) skipReason = "(Waiting for 1 or 7)";
      } else if (settings.strategy === "TREND_FOLLOW") {
        const p = getTrendFollowPrediction(userId);
        ch = p.choice; shouldSkip = p.shouldSkip;
      } else if (settings.strategy === "ALTERNATE") {
        const p = getAlternatePrediction(userId);
        ch = p.choice; shouldSkip = p.shouldSkip;
      } else if (settings.strategy === "BS_ORDER") {
        ch = getBsOrderPrediction(userId).choice;
      } else if (settings.strategy === "LEO") {
        const p = await getLeoPrediction(userId, settings);
        ch = p.prediction;
      } else if (settings.strategy === "DREAM") {
        const p = await getDreamPrediction(userId, settings);
        ch = p.prediction;
      } else if (settings.strategy === "CHAT_GPT_V1") {
        const p = await getAIPrediction(userId, gameType);
        ch = p.result;
      } else {
        ch = 'B';
      }
      
      const selectType = getSelectMap(gameType, betType)[ch];
      if (selectType === undefined) { settings.consecutive_errors++; await new Promise(r => setTimeout(r, 2000)); continue; }
      
      if (entryLayer === 1) {
        if (!shouldSkip) { shouldSkip = userShouldSkipNext[userId] || false; if (shouldSkip) skipReason = "(SL Layer Skip)"; }
      } else if (entryLayer === 2) {
        if (settings.entry_layer_state && settings.entry_layer_state.waiting_for_lose) {
          shouldSkip = true; skipReason = "(Entry Layer 2 - Wait for Lose)";
        } else {
          if (!shouldSkip) { shouldSkip = userShouldSkipNext[userId] || false; if (shouldSkip) skipReason = "(SL Layer Skip)"; }
        }
        if (settings.entry_layer_state && settings.entry_layer_state.waiting_for_lose && shouldSkip) settings.entry_layer_state.waiting_for_lose = false;
      } else if (entryLayer === 3) {
        if (settings.entry_layer_state && settings.entry_layer_state.waiting_for_loses) {
          shouldSkip = true; skipReason = `(Entry Layer 3 - Wait for ${settings.entry_layer_state.consecutive_loses || 0}/2 Loses)`;
        } else {
          if (!shouldSkip) { shouldSkip = userShouldSkipNext[userId] || false; if (shouldSkip) skipReason = "(SL Layer Skip)"; }
        }
        if (settings.entry_layer_state && settings.entry_layer_state.waiting_for_lose && shouldSkip) settings.entry_layer_state.waiting_for_lose = false;
      }
      
      const betEmoji = getBetIndexEmoji(settings);
      const gameId = `${EMOJI.GAME} ${gameType} : ${currentIssue}`;
      
      if (shouldSkip) {
        const betMsg = `${EMOJI.SKIP} SKIPPING ${skipReason ? `(${skipReason})` : ''}\n\n${safeEscape(gameId)}\n${EMOJI.STRATEGY} Strategy: ${strategyText}`;
        await sendMessageWithRetry(ctx, betMsg);
        if (!userSkippedBets[userId]) userSkippedBets[userId] = {};
        userSkippedBets[userId][currentIssue] = [ch, settings.virtual_mode, false];
        userSkipResultWait[userId] = currentIssue;
        let resultAvailable = false, waitAttempts = 0;
        while (!resultAvailable && waitAttempts < 60 && settings.running) {
          await new Promise(r => setTimeout(r, 1000));
          if (!userSkippedBets[userId] || !userSkippedBets[userId][currentIssue]) resultAvailable = true;
          waitAttempts++;
        }
        if (!resultAvailable && userSkipResultWait[userId] === currentIssue) delete userSkipResultWait[userId];
      } else {
        let desiredAmount;
        try { desiredAmount = calculateBetAmount(settings, currentBalance); }
        catch (error) {
          await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Error: ${error.message}`, makeMainKeyboard(true, isAdmin(userId)));
          settings.running = false;
          break;
        }
        
        if (desiredAmount === 0) {
          const betMsg = `${EMOJI.SKIP} SKIPPING (Bet_Wrager 0)\n\n${safeEscape(gameId)}\n${EMOJI.STRATEGY} Strategy: ${strategyText}`;
          await sendMessageWithRetry(ctx, betMsg);
          if (!userSkippedBets[userId]) userSkippedBets[userId] = {};
          userSkippedBets[userId][currentIssue] = [ch, settings.virtual_mode, true];
          userSkipResultWait[userId] = currentIssue;
          
          if (settings.betting_strategy === "Martingale") {
            settings.martin_index = Math.min((settings.martin_index || 0) + 1, betSizes.length - 1);
          } else if (settings.betting_strategy === "Anti-Martingale") {
            settings.martin_index = 0;
          } else if (settings.betting_strategy === "Custom") {
            settings.custom_index = Math.min((settings.custom_index || 0) + 1, betSizes.length - 1);
          }

          let resultAvailable = false, waitAttempts = 0;
          while (!resultAvailable && waitAttempts < 60 && settings.running) {
            await new Promise(r => setTimeout(r, 1000));
            if (!userSkippedBets[userId] || !userSkippedBets[userId][currentIssue]) resultAvailable = true;
            waitAttempts++;
          }
          if (!resultAvailable && userSkipResultWait[userId] === currentIssue) delete userSkipResultWait[userId];
          
          settings.last_issue = currentIssue;
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        
        const { unitAmount, betCount, actualAmount } = computeBetDetails(desiredAmount);
        
        if (actualAmount === 0 || currentBalance < actualAmount) {
          const message = `${EMOJI.WARNING} ${STYLE.BOLD('Low Balance!')}\n${STYLE.SEPARATOR}\n${STYLE.ITEM(`Current: ${currentBalance.toFixed(2)} Ks`)}\n${STYLE.LAST_ITEM(`Required: ${actualAmount} Ks`)}`;
          await sendMessageWithRetry(ctx, message, makeMainKeyboard(true, isAdmin(userId)));
          settings.running = false;
          break;
        }
        
        let betChoiceText;
        if (betType === "COLOR") betChoiceText = getColorName(ch);
        else betChoiceText = ch === 'B' ? `BIG` : `SMALL`;
        
        const betMsg = `${safeEscape(gameId)}\n${betEmoji} Order: ${safeEscape(betChoiceText)} → ${actualAmount} Ks\n${EMOJI.STRATEGY} Strategy: ${safeEscape(strategyText)}`;
        await sendMessageWithRetry(ctx, betMsg);
        
        if (settings.virtual_mode) {
          if (!userPendingBets[userId]) userPendingBets[userId] = {};
          userPendingBets[userId][currentIssue] = [ch, actualAmount, true];
          userWaitingForResult[userId] = true;
        } else {
          const betResp = await placeBetRequest(session, currentIssue, selectType, unitAmount, betCount, gameType, parseInt(userId));
          if (betResp.error || betResp.code !== 0) {
            await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Bet error: ${betResp.msg || betResp.error}. Retrying...`);
            await new Promise(r => setTimeout(r, 5000));
            continue;
          }
          if (!userPendingBets[userId]) userPendingBets[userId] = {};
          userPendingBets[userId][currentIssue] = [ch, actualAmount, false];
          userWaitingForResult[userId] = true;
        }
      }
      
      settings.last_issue = currentIssue;
      await new Promise(r => setTimeout(r, 1000));
    }
  } catch (error) {
    logging.error(`Betting worker error: ${error.message}`);
    await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Error: ${error.message}. Stopping...`);
    settings.running = false;
  } finally {
    settings.running = false;
    delete userWaitingForResult[userId];
    delete userShouldSkipNext[userId];
    delete userBalanceWarnings[userId];
    delete userSkipResultWait[userId];
    delete userSLSkipWaitingForWin[userId];
    
    if (settings.strategy === "COLOR_SNIPER") delete settings.color_sniper_state;
    if (settings.strategy === "TREND_FOLLOW") { delete settings.trend_state; delete settings.color_trend_state; }
    if (settings.strategy === "ALTERNATE") delete settings.alternate_state;
    if (settings.strategy === "BS_ORDER") settings.pattern_index = 0;
    if (settings.strategy === "LEO") delete settings.leo_state;
    if (settings.strategy === "DREAM") delete settings.dream_state;
    if (settings.strategy === "CHAT_GPT_V1") {
      delete userAILast10Results[userId];
      delete userAIRoundCount[userId];
    }
    
    let totalProfit = 0, balanceText = "";
    if (settings.virtual_mode) {
      totalProfit = (userStats[userId]?.virtual_balance || 0) - (userStats[userId]?.initial_balance || 0);
      balanceText = `${EMOJI.VIRTUAL} Virtual Balance: ${(userStats[userId]?.virtual_balance || 0).toFixed(2)} Ks\n`;
    } else {
      totalProfit = userStats[userId]?.profit || 0;
      try {
        const finalBalance = await getBalance(session, parseInt(userId));
        balanceText = `${EMOJI.BALANCE} Final Balance: ${finalBalance?.toFixed(2) || '0.00'} Ks\n`;
      } catch (error) { balanceText = `${EMOJI.BALANCE} Final Balance: Unknown\n`; }
    }
    
    const profitIndicator = totalProfit > 0 ? "+" : (totalProfit < 0 ? "-" : "");
    delete userStats[userId];
    settings.martin_index = 0; settings.dalembert_units = 1; settings.custom_index = 0;
    
    if (!userStopInitiated[userId]) {
      const message = `${EMOJI.STOP} ${STYLE.BOLD('SESSION TERMINATED')}\n${balanceText}${EMOJI.PROFIT} Total Profit: ${profitIndicator}${totalProfit.toFixed(2)} Ks`;
      await sendMessageWithRetry(ctx, message, makeMainKeyboard(true, isAdmin(userId)));
    }
    delete userStopInitiated[userId];
    delete userAllResults[userId];
  }
}

// ===== KEYBOARDS =====
function makePlatformKeyboard() {
  return Markup.keyboard([
    [{ text: `${PLATFORMS["6LOTTERY"].color} ${PLATFORMS["6LOTTERY"].name}`, style: 'primary' },
     { text: `${PLATFORMS["CKLOTTERY"].color} ${PLATFORMS["CKLOTTERY"].name}`, style: 'primary' }]
  ]).resize().oneTime(false);
}

function makeMainKeyboard(loggedIn = false, isAdminUser = false) {
  if (!loggedIn) {
    return Markup.keyboard([
      [{ text: `${EMOJI.LOGIN} Login`, style: 'success' }, 
       { text: `📖 Tutorial`, style: 'primary' }]
    ]).resize().oneTime(false);
  }
  
  const keyboard = [
    [{ text: `${EMOJI.START} Activate`, style: 'success' },
     { text: `${EMOJI.STOP} Deactivate`, style: 'danger' }],
    [{ text: `${EMOJI.BETWRAGER} Bet_Wrager`, style: 'primary' },
     { text: `${EMOJI.GAME} Game Mode`, style: 'primary' }],
    [{ text: `${EMOJI.TARGET} Game Type`, style: 'primary' }, 
     { text: `${EMOJI.COLOR} Bet Type`, style: 'primary' }, 
     { text: `${EMOJI.STRATEGY} Strategy`, style: 'primary' }],
    [{ text: `${EMOJI.SETTINGS} Betting Settings`, style: 'primary' }, 
     { text: `${EMOJI.RISK} Risk Management`, style: 'primary' }],
    [{ text: `${EMOJI.BET} Manual Bet`, style: 'primary' }, 
     { text: `${EMOJI.INFO} Account Info`, style: 'primary' }, 
     { text: `${EMOJI.LOGOUT} Re-Login`, style: 'danger' }],
    [{ text: `📅 Daily Report`, style: 'primary' }, 
     { text: `📖 Tutorial`, style: 'primary' }]
  ];
  
  if (isAdminUser) keyboard.push([{ text: `${EMOJI.ADMIN} Admin Panel`, style: 'primary' }]);
  return Markup.keyboard(keyboard).resize().oneTime(false);
}

function makeRiskManagementSubmenu() {
  return Markup.keyboard([
    [{ text: `${EMOJI.TARGET} Profit Target`, style: 'primary' }, 
     { text: `${EMOJI.STOP} Stop Loss`, style: 'danger' }],
    [{ text: `${EMOJI.LAYER} Entry Layer`, style: 'primary' }, 
     { text: `${EMOJI.WARNING} Bet SL`, style: 'danger' }],
    [{ text: `${EMOJI.BACK} Back`, style: 'primary' }]
  ]).resize().oneTime(false);
}

function makeAdminPanelKeyboard(userId) {
  const isOwner = userId === ADMIN_ID;
  const rows = [];
  rows.push([{ text: `${EMOJI.ADD} Add User`, style: 'success' }, { text: `${EMOJI.REMOVE} Remove User`, style: 'danger' }]);
  rows.push([{ text: `${EMOJI.STATS} User Stats`, style: 'primary' }, { text: `${EMOJI.MENU} Allowed IDs`, style: 'primary' }]);
  rows.push([{ text: `${EMOJI.BROADCAST} Broadcast`, style: 'primary' }]);
  if (isOwner) {
    rows.push([{ text: `👥 Add Admin`, style: 'success' }, { text: `❌ Remove Admin`, style: 'danger' }]);
    rows.push([{ text: `📋 List Admins`, style: 'primary' }]);
  }
  rows.push([{ text: `${EMOJI.MENU} Main Menu`, style: 'primary' }]);
  return Markup.keyboard(rows).resize().oneTime(false);
}

function makeStrategyKeyboard(userId = null) {
  if (userId && userSettings[userId] && userSettings[userId].bet_type === "COLOR") {
    return Markup.inlineKeyboard([
      [Markup.button.callback(`${EMOJI.TREND} TREND_FOLLOW`, "strategy:TREND_FOLLOW")],
      [Markup.button.callback(`🎯 COLOR SNIPER`, "strategy:COLOR_SNIPER")]
    ]);
  }
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${EMOJI.TREND} TREND_FOLLOW`, "strategy:TREND_FOLLOW"), Markup.button.callback(`${EMOJI.ALTERNATE} ALTERNATE`, "strategy:ALTERNATE")],
    [Markup.button.callback(`${EMOJI.PATTERN} BS ORDER`, "strategy:BS_ORDER")],
    [Markup.button.callback(`🫟 LEO`, "strategy:LEO")],
    [Markup.button.callback(`🦅 Dream`, "strategy:DREAM")],
    [Markup.button.callback(`✮⋆˙ CHAT GPT V1`, "strategy:CHAT_GPT_V1")]
  ]);
}

function makeBetTypeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`Big/Small`, "bet_type:BS")],
    [Markup.button.callback(`Color`, "bet_type:COLOR")]
  ]);
}

function makeBSWaitCountKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("1", "bs_wait_count:1"), Markup.button.callback("2", "bs_wait_count:2"), Markup.button.callback("3", "bs_wait_count:3")],
    [Markup.button.callback("4", "bs_wait_count:4"), Markup.button.callback("5", "bs_wait_count:5"), Markup.button.callback("6", "bs_wait_count:6")],
    [Markup.button.callback(`${EMOJI.CHECK} 0 (Disable)`, "bs_wait_count:0")]
  ]);
}

function makeBBWaitCountKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("1", "bb_wait_count:1"), Markup.button.callback("2", "bb_wait_count:2"), Markup.button.callback("3", "bb_wait_count:3")],
    [Markup.button.callback("4", "bb_wait_count:4"), Markup.button.callback("5", "bb_wait_count:5"), Markup.button.callback("6", "bb_wait_count:6")],
    [Markup.button.callback(`${EMOJI.CHECK} 0 (Disable)`, "bb_wait_count:0")]
  ]);
}

function makeBettingStrategyKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${EMOJI.ANTI_MARTINGALE} Anti-Martingale`, "betting_strategy:Anti-Martingale")],
    [Markup.button.callback(`${EMOJI.MARTINGALE} Martingale`, "betting_strategy:Martingale")],
    [Markup.button.callback(`${EMOJI.DALEMBERT} D'Alembert`, "betting_strategy:D'Alembert")]
  ]);
}

function makeGameTypeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${EMOJI.GAME} WINGO`, "game_type:WINGO_SELECT")],
    [Markup.button.callback(`${EMOJI.GAME} TRX`, "game_type:TRX")]
  ]);
}

function makeWINGOSelectionKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${EMOJI.GAME} WINGO 30s`, "game_type:WINGO_30S"), Markup.button.callback(`${EMOJI.GAME} WINGO 1min`, "game_type:WINGO")],
    [Markup.button.callback(`${EMOJI.GAME} WINGO 3min`, "game_type:WINGO_3MIN"), Markup.button.callback(`${EMOJI.GAME} WINGO 5min`, "game_type:WINGO_5MIN")]
  ]);
}

function makeEntryLayerKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("1 - Direct For BET", "entry_layer:1")],
    [Markup.button.callback("2 - Wait for 1 Lose", "entry_layer:2")],
    [Markup.button.callback("3 - Wait for 2 Loses", "entry_layer:3")]
  ]);
}

function makeSLLayerKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${EMOJI.CHECK} 0 - Disabled`, "sl_layer:0")],
    [Markup.button.callback("1", "sl_layer:1"), Markup.button.callback("2", "sl_layer:2"), Markup.button.callback("3", "sl_layer:3")],
    [Markup.button.callback("4", "sl_layer:4"), Markup.button.callback("5", "sl_layer:5"), Markup.button.callback("6", "sl_layer:6")],
    [Markup.button.callback("7", "sl_layer:7"), Markup.button.callback("8", "sl_layer:8"), Markup.button.callback("9", "sl_layer:9")]
  ]);
}

function makeModeSelectionKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`${EMOJI.VIRTUAL} Virtual Mode`, "mode:virtual")],
    [Markup.button.callback(`${EMOJI.REAL} Real Mode`, "mode:real")]
  ]);
}

function makeManualBetMenuKeyboard() {
  return Markup.keyboard([
    [{ text: `${EMOJI.RESULT} BIG`, style: 'primary' }, 
     { text: `${EMOJI.RESULT} SMALL`, style: 'primary' }],
    [{ text: `🟢 GREEN`, style: 'success' }, 
     { text: `🔴 RED`, style: 'danger' }, 
     { text: `🟣 VIOLET`, style: 'primary' }],
    [{ text: `${EMOJI.RESULTSBS} Game Results`, style: 'primary' }, 
     { text: `${EMOJI.BET} My Bets`, style: 'primary' }],
    [{ text: `${EMOJI.BALANCE} My Balance`, style: 'primary' }, 
     { text: `${EMOJI.GAME} Game Type`, style: 'primary' }],
    [{ text: `${EMOJI.BACK} Back`, style: 'primary' }]
  ]).resize().oneTime(false);
}

function makeManualAmountKeyboard(choice) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("10", `manual_amt_10_${choice}`), Markup.button.callback("100", `manual_amt_100_${choice}`), Markup.button.callback("1,000", `manual_amt_1000_${choice}`)],
    [Markup.button.callback("10,000", `manual_amt_10000_${choice}`), Markup.button.callback("100,000", `manual_amt_100000_${choice}`), Markup.button.callback("Custom", `manual_amt_custom_${choice}`)]
  ]);
}

function makeManualMultiplierKeyboard(choice, amount) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("1x", `manual_mult_1_${choice}_${amount}`), Markup.button.callback("5x", `manual_mult_5_${choice}_${amount}`), Markup.button.callback("20x", `manual_mult_20_${choice}_${amount}`)],
    [Markup.button.callback("50x", `manual_mult_50_${choice}_${amount}`), Markup.button.callback("100x", `manual_mult_100_${choice}_${amount}`), Markup.button.callback("Custom", `manual_mult_custom_${choice}_${amount}`)]
  ]);
}

function makeManualConfirmKeyboard(choice, amount, multiplier) {
  const total = amount * multiplier;
  let choiceText;
  if (choice === 'B') choiceText = 'BIG';
  else if (choice === 'S') choiceText = 'SMALL';
  else if (choice === 'G') choiceText = 'GREEN 🟢';
  else if (choice === 'R') choiceText = 'RED 🔴';
  else if (choice === 'V') choiceText = 'VIOLET 🟣';
  else choiceText = choice;
  return Markup.inlineKeyboard([
    [Markup.button.callback(`✅ YES (Bet ${total} on ${choiceText})`, `manual_confirm_${choice}_${amount}_${multiplier}`)],
    [Markup.button.callback("❌ CANCEL", `manual_cancel`)]
  ]);
}

async function checkUserAuthorized(ctx) {
  const userId = ctx.from.id;
  if (!userSessions[userId]) {
    await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Please login first`, makeMainKeyboard(false, isAdmin(userId)));
    return false;
  }
  if (!userSettings[userId]) {
    userSettings[userId] = {
      platform: "6LOTTERY", strategy: "TREND_FOLLOW", betting_strategy: "Martingale",
      game_type: "WINGO", bet_type: "BS",
      martin_index: 0, dalembert_units: 1, pattern_index: 0, running: false,
      consecutive_losses: 0, current_layer: 0, skip_betting: false, sl_layer: null,
      original_martin_index: 0, original_dalembert_units: 1, original_custom_index: 0,
      custom_index: 0, layer_limit: 1, virtual_mode: false, bs_sb_wait_count: 0, bb_ss_wait_count: 0
    };
  }
  return true;
}

function escapeMarkdown(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

async function cmdStartHandler(ctx) {
  const userId = ctx.from.id;
  const userName = ctx.from.username || ctx.from.first_name || "User";
  const isAdminUser = isAdmin(userId);
  activeUsers.add(userId);
  
  if (!userSettings[userId]) {
    userSettings[userId] = {
      strategy: "TREND_FOLLOW", betting_strategy: "Martingale", game_type: "WINGO", bet_type: "BS",
      martin_index: 0, dalembert_units: 1, pattern_index: 0, running: false,
      consecutive_losses: 0, current_layer: 0, skip_betting: false, sl_layer: null,
      original_martin_index: 0, original_dalembert_units: 1, original_custom_index: 0,
      custom_index: 0, layer_limit: 1, virtual_mode: false, bs_sb_wait_count: 0, bb_ss_wait_count: 0
    };
  }
  userLastResults[userId] = [];
  
  const loggedIn = !!userSessions[userId];
  let profilePhotoId = null;
  try {
    const photos = await ctx.telegram.getUserProfilePhotos(userId, 0, 1);
    if (photos.total_count > 0) profilePhotoId = photos.photos[0][0].file_id;
  } catch (e) {}

  const safeUserName = escapeMarkdown(userName);
  const safeUserId = escapeMarkdown(userId.toString());
  
  const welcomeMessage = 
    `${STYLE.HEADER('WELCOME TO AUTO BET BOT')}\n\n` +
    `${EMOJI.USER} ${STYLE.BOLD('User Information')}\n` +
    `${STYLE.ITEM(`ID: ${STYLE.CODE(safeUserId)}`)}\n` +
    `${STYLE.LAST_ITEM(`Name: ${safeUserName}`)}\n\n` +
    `${loggedIn ? `${EMOJI.CHECK} ${STYLE.BOLD('Status: Logged In')}` : `${EMOJI.ERROR} ${STYLE.BOLD('Status: Please Login')}`}\n\n` +
    `${EMOJI.MENU} ${STYLE.BOLD('Use the buttons below to get started')}`;
  
  if (profilePhotoId) {
    await ctx.replyWithPhoto(profilePhotoId, {
      caption: welcomeMessage, parse_mode: 'Markdown',
      reply_markup: makeMainKeyboard(loggedIn, isAdminUser).reply_markup
    });
  } else {
    await ctx.reply(welcomeMessage, {
      parse_mode: 'Markdown', reply_markup: makeMainKeyboard(loggedIn, isAdminUser).reply_markup
    });
  }
}

async function cmdAllowHandler(ctx) {
  const userId = ctx.from.id;
  if (!isAdmin(userId)) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Admin only!`, makeMainKeyboard(true, isAdmin(userId))); return; }
  const args = ctx.message.text.split(' ').slice(1);
  if (!args.length || !args[0].match(/^\d+$/)) { await sendMessageWithRetry(ctx, `${EMOJI.INFO} Usage: /allow {id}`, makeAdminPanelKeyboard(userId)); return; }
  const sixlotteryId = parseInt(args[0]);
  if (allowedsixlotteryIds.has(sixlotteryId)) await sendMessageWithRetry(ctx, `${EMOJI.INFO} User ${sixlotteryId} already added`, makeAdminPanelKeyboard(userId));
  else { allowedsixlotteryIds.add(sixlotteryId); saveAllowedUsers(); await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} User ${sixlotteryId} added`, makeAdminPanelKeyboard(userId)); }
}

async function cmdRemoveHandler(ctx) {
  const userId = ctx.from.id;
  if (!isAdmin(userId)) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Admin only!`, makeMainKeyboard(true, isAdmin(userId))); return; }
  const args = ctx.message.text.split(' ').slice(1);
  if (!args.length || !args[0].match(/^\d+$/)) { await sendMessageWithRetry(ctx, `${EMOJI.INFO} Usage: /remove {id}`, makeAdminPanelKeyboard(userId)); return; }
  const sixlotteryId = parseInt(args[0]);
  if (!allowedsixlotteryIds.has(sixlotteryId)) await sendMessageWithRetry(ctx, `${EMOJI.INFO} User ${sixlotteryId} not found`, makeAdminPanelKeyboard(userId));
  else { allowedsixlotteryIds.delete(sixlotteryId); saveAllowedUsers(); await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} User ${sixlotteryId} removed`, makeAdminPanelKeyboard(userId)); }
}

async function cmdShowIdHandler(ctx) {
  const userId = ctx.from.id;
  if (!isAdmin(userId)) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Admin only!`); return; }
  try {
    let allowedIds = [];
    if (fs.existsSync('users_6lottery.json')) {
      const data = JSON.parse(fs.readFileSync('users_6lottery.json', 'utf8'));
      allowedIds = data.allowed_ids || [];
    } else allowedIds = Array.from(allowedsixlotteryIds);
    if (allowedIds.length === 0) { await sendMessageWithRetry(ctx, `${EMOJI.INFO} No allowed IDs found.`); return; }
    let message = `${EMOJI.MENU} ${STYLE.BOLD('List of Allowed IDs')}:\n\n`;
    allowedIds.forEach((id, index) => { message += `${index + 1}. ${STYLE.CODE(id.toString())}\n`; });
    message += `\n${EMOJI.INFO} Total: ${allowedIds.length} allowed users`;
    await sendMessageWithRetry(ctx, message);
  } catch (error) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Error.`); }
}

async function cmdUsersHandler(ctx) {
  const userId = ctx.from.id;
  if (!isAdmin(userId)) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Admin only!`); return; }
  try {
    const telegramUserIds = Array.from(activeUsers);
    if (telegramUserIds.length === 0) { await sendMessageWithRetry(ctx, `${EMOJI.INFO} No active users found.`); return; }
    let message = `${EMOJI.MENU} ${STYLE.BOLD('List of Active Users')}:\n\n`;
    for (const telegramId of telegramUserIds) {
      const userInfo = userGameInfo[telegramId];
      const userName = userInfo?.nickname || userInfo?.username || "Unknown";
      const gameUserId = userInfo?.user_id || "Not logged in";
      const balance = userInfo?.balance || 0;
      const isRunning = userSettings[telegramId]?.running || false;
      const platform = userSettings[telegramId]?.platform || "N/A";
      message += `${EMOJI.USER} ${userName}\n${STYLE.ITEM(`Telegram ID: ${STYLE.CODE(telegramId.toString())}`)}\n${STYLE.ITEM(`Game ID: ${gameUserId}`)}\n${STYLE.ITEM(`Platform: ${platform}`)}\n${STYLE.ITEM(`Balance: ${balance.toFixed(2)} Ks`)}\n${STYLE.LAST_ITEM(`Status: ${isRunning ? '🟢 Running' : '🔴 Stopped'}`)}\n\n`;
    }
    message += `\n${EMOJI.INFO} Total: ${telegramUserIds.length} active users`;
    await sendMessageWithRetry(ctx, message);
  } catch (error) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Error.`); }
}

async function cmdSendHandler(ctx) {
  await sendMessageWithRetry(ctx, `${EMOJI.INFO} Please use Broadcast button in Admin Panel.`, makeMainKeyboard(true, isAdmin(ctx.from.id)));
}

async function callbackQueryHandler(ctx) {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const data = ctx.callbackQuery.data;
  
  if (data.startsWith("restart_bot:")) {
    const userIdFromCallback = parseInt(data.split(":")[1]);
    if (userIdFromCallback !== userId) { await ctx.reply(`${EMOJI.ERROR} Unauthorized action`); return; }
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
    const settings = userSettings[userId] || {};
    if (!settings.bet_sizes) { await ctx.reply(`${EMOJI.ERROR} Please set Bet_Wrager first!`); return; }
    if (settings.running) { await ctx.reply(`${EMOJI.INFO} Bot is already running!`); return; }
    settings.running = true;
    settings.consecutive_errors = 0;
    saveUserSettings();
    
    const entryLayer = settings.layer_limit || 1;
    if (entryLayer === 2) settings.entry_layer_state = { waiting_for_lose: true };
    else if (entryLayer === 3) settings.entry_layer_state = { waiting_for_loses: true, consecutive_loses: 0 };
    
    if (settings.strategy === "TREND_FOLLOW") {
      const betType = settings.bet_type || "BS";
      if (betType === "COLOR") settings.color_trend_state = { last_result: null };
      else settings.trend_state = { last_result: null, skip_mode: false };
    }
    if (settings.strategy === "ALTERNATE") settings.alternate_state = { last_result: null, skip_mode: false };
    if (settings.strategy === "COLOR_SNIPER") {
      settings.color_sniper_state = { active: false, step: 0, hit_count: 0, waiting_for_trigger: true };
      settings.sniper_hit_count = 0;
      settings.sniper_loss_count = 0;
    }
    if (settings.strategy === "LEO") {
      settings.leo_state = { last_result: null, pattern_index: 0 };
    }
    if (settings.strategy === "DREAM") {
      settings.dream_state = { first_bet: true, current_pattern: "", current_index: 0 };
    }
    if (settings.strategy === "CHAT_GPT_V1") {
      userAILast10Results[userId] = [];
      userAIRoundCount[userId] = 0;
    }
    
    delete userSkippedBets[userId];
    userShouldSkipNext[userId] = false;
    delete userSLSkipWaitingForWin[userId];
    userWaitingForResult[userId] = false;
    
    await ctx.reply(`${EMOJI.START} Bot restarted successfully!`);
    bettingWorker(userId, ctx, ctx.telegram);
    return;
  }
  
  if (!await checkUserAuthorized(ctx)) return;
  
  if (data.startsWith("risk:")) {
    const riskOption = data.split(":")[1];
    switch (riskOption) {
      case "profit_target":
        userState[userId] = { state: "INPUT_PROFIT_TARGET" };
        await sendMessageWithRetry(ctx, `${EMOJI.TARGET} ${STYLE.BOLD('Profit Target Settings')}\n\n${EMOJI.INFO} Enter profit target (in Ks):\n\n${STYLE.CODE('Example: 10000')}`);
        break;
      case "stop_loss":
        userState[userId] = { state: "INPUT_STOP_LIMIT" };
        await sendMessageWithRetry(ctx, `${EMOJI.STOP} ${STYLE.BOLD('Stop Loss Settings')}\n\n${EMOJI.INFO} Enter stop loss (in Ks):\n\n${STYLE.CODE('Example: 5000')}`);
        break;
      case "entry_layer":
        await sendMessageWithRetry(ctx, `${EMOJI.LAYER} ${STYLE.BOLD('Entry Layer Settings')}\n\n${EMOJI.INFO} Select when to start betting:`, makeEntryLayerKeyboard());
        break;
      case "bet_sl":
        await sendMessageWithRetry(ctx, `${EMOJI.WARNING} ${STYLE.BOLD('Stop Loss Layer Settings')}\n\n${EMOJI.INFO} Select consecutive losses:`, makeSLLayerKeyboard());
        break;
    }
    await safeDeleteMessage(ctx);
    return;
  }
  
  if (data.startsWith("strategy:")) {
    const strategy = data.split(":")[1];
    userSettings[userId].strategy = strategy;
    
    if (strategy === "BS_ORDER") {
      userState[userId] = { state: "INPUT_BS_PATTERN" };
      await sendMessageWithRetry(ctx, `${EMOJI.PATTERN} ${STYLE.BOLD('BS Pattern Settings')}\n\n${EMOJI.INFO} Enter BS pattern (B and S only):\n\n${STYLE.CODE('Example: BSBSSBBS')}`);
    } else if (strategy === "TREND_FOLLOW") {
      const betType = userSettings[userId].bet_type || "BS";
      if (betType === "COLOR") {
        await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD('Strategy: Trend Follow (Color Mode)')}`, makeMainKeyboard(true, isAdmin(userId)));
      } else {
        await sendMessageWithRetry(ctx, `${EMOJI.TREND} ${STYLE.BOLD('Trend Follow Settings')}\n\n${EMOJI.INFO} Select BS/SB Wait Count:`, makeBSWaitCountKeyboard());
      }
    } else if (strategy === "ALTERNATE") {
      await sendMessageWithRetry(ctx, `${EMOJI.ALTERNATE} ${STYLE.BOLD('Alternate Settings')}\n\n${EMOJI.INFO} Select BB/SS Wait Count:`, makeBBWaitCountKeyboard());
    } else if (strategy === "COLOR_SNIPER") {
      await sendMessageWithRetry(ctx, `🎯 ${STYLE.BOLD('COLOR_SNIPER Activated')}\n\n${EMOJI.INFO} • Terminates after ${SNIPER_MAX_HITS} hits`, makeMainKeyboard(true, isAdmin(userId)));
    } else if (strategy === "LEO") {
      await sendMessageWithRetry(ctx, `🫟 ${STYLE.BOLD('LEO Activated')}\n\n${EMOJI.INFO} • Dual Pattern (BIG/SMALL)`, makeMainKeyboard(true, isAdmin(userId)));
    } else if (strategy === "DREAM") {
      await sendMessageWithRetry(ctx, `🦅 ${STYLE.BOLD('Dream Activated')}\n\n${EMOJI.INFO} • Number-based Pattern (0-9)`, makeMainKeyboard(true, isAdmin(userId)));
    } else if (strategy === "CHAT_GPT_V1") {
      await sendMessageWithRetry(ctx, `✮⋆˙ ${STYLE.BOLD('CHAT GPT V1 Activated')}\n\n${EMOJI.INFO} • AI-based Pattern Detection\n${EMOJI.INFO} • Last 10 Results Analysis`, makeMainKeyboard(true, isAdmin(userId)));
    }
    saveUserSettings();
    await safeDeleteMessage(ctx);
    return;
  }
  
  if (data.startsWith("bet_type:")) {
    const betType = data.split(":")[1];
    userSettings[userId].bet_type = betType;
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD(`Bet Type: ${betType === "COLOR" ? "Color" : "Big/Small"}`)}`, makeMainKeyboard(true, isAdmin(userId)));
    saveUserSettings();
    await safeDeleteMessage(ctx);
    return;
  }
  
  if (data.startsWith("bs_wait_count:")) {
    const waitCount = parseInt(data.split(":")[1]);
    userSettings[userId].bs_sb_wait_count = waitCount;
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} BS/SB Wait: ${waitCount}`, makeMainKeyboard(true, isAdmin(userId)));
    saveUserSettings();
    await safeDeleteMessage(ctx);
    return;
  }
  
  if (data.startsWith("bb_wait_count:")) {
    const waitCount = parseInt(data.split(":")[1]);
    userSettings[userId].bb_ss_wait_count = waitCount;
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} BB/SS Wait: ${waitCount}`, makeMainKeyboard(true, isAdmin(userId)));
    saveUserSettings();
    await safeDeleteMessage(ctx);
    return;
  }
  
  if (data.startsWith("betting_strategy:")) {
    const bettingStrategy = data.split(":")[1];
    userSettings[userId].betting_strategy = bettingStrategy;
    userSettings[userId].martin_index = 0;
    userSettings[userId].dalembert_units = 1;
    userSettings[userId].consecutive_losses = 0;
    userSettings[userId].skip_betting = false;
    userSettings[userId].custom_index = 0;
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD('Betting Strategy:')} ${bettingStrategy}`, makeMainKeyboard(true, isAdmin(userId)));
    saveUserSettings();
    await safeDeleteMessage(ctx);
    return;
  }
  
  if (data.startsWith("game_type:")) {
    const gameType = data.split(":")[1];
    if (gameType === "WINGO_SELECT") {
      await sendMessageWithRetry(ctx, `${EMOJI.GAME} ${STYLE.BOLD('Select WINGO Game Type')}`, makeWINGOSelectionKeyboard());
      await safeDeleteMessage(ctx);
      return;
    }
    userSettings[userId].game_type = gameType;
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD('Game Type set')}`, makeMainKeyboard(true, isAdmin(userId)));
    saveUserSettings();
    await safeDeleteMessage(ctx);
    return;
  }

  if (data.startsWith("entry_layer:")) {
    const layerValue = parseInt(data.split(":")[1]);
    const settings = userSettings[userId];
    if (!settings) return;
    settings.layer_limit = layerValue;
    if (layerValue === 2) settings.entry_layer_state = { waiting_for_lose: true };
    else if (layerValue === 3) settings.entry_layer_state = { waiting_for_loses: true, consecutive_loses: 0 };
    let description = layerValue === 1 ? "Bet immediately" : layerValue === 2 ? "Wait for 1 lose" : "Wait for 2 loses";
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD(`Entry Layer: ${layerValue}`)}\n\n${EMOJI.INFO} ${description}`, makeRiskManagementSubmenu());
    saveUserSettings();
    await safeDeleteMessage(ctx);
    return;
  }

  if (data.startsWith("sl_layer:")) {
    const slValue = parseInt(data.split(":")[1]);
    userSettings[userId].sl_layer = slValue > 0 ? slValue : null;
    userSettings[userId].consecutive_losses = 0;
    userSettings[userId].skip_betting = false;
    userSettings[userId].original_martin_index = 0;
    userSettings[userId].original_dalembert_units = 1;
    userSettings[userId].original_custom_index = 0;
    let description = slValue === 0 ? "Disabled" : `Skip after ${slValue} losses`;
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD(`SL Layer: ${slValue}`)}\n\n${EMOJI.INFO} ${description}`, makeRiskManagementSubmenu());
    saveUserSettings();
    await safeDeleteMessage(ctx);
    return;
  }
  
  if (data.startsWith("mode:")) {
    const mode = data.split(":")[1];
    const settings = userSettings[userId];
    if (mode === "virtual") {
      userState[userId] = { state: "INPUT_VIRTUAL_BALANCE" };
      await sendMessageWithRetry(ctx, `${EMOJI.VIRTUAL} ${STYLE.BOLD('Virtual Mode Settings')}\n\n${EMOJI.INFO} Enter virtual balance (in Ks):\n\n${STYLE.CODE('Example: 10000')}`);
    } else if (mode === "real") {
      settings.virtual_mode = false;
      await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD('Switched to Real Mode')}`, makeMainKeyboard(true, isAdmin(userId)));
      saveUserSettings();
    }
    await safeDeleteMessage(ctx);
    return;
  }

  if (data.startsWith("manual_amt_")) {
    const parts = data.split("_");
    if (parts[2] === "custom") {
      const choice = parts[3];
      userState[userId] = { state: "INPUT_MANUAL_CUSTOM_AMT", choice };
      await sendMessageWithRetry(ctx, `${EMOJI.BALANCE} Enter custom amount:`);
    } else {
      const amount = parseInt(parts[2]);
      const choice = parts[3];
      await sendMessageWithRetry(ctx, `${EMOJI.BALANCE} Amount: *${amount}*\n\n${EMOJI.RISK} Select Multiplier:`, makeManualMultiplierKeyboard(choice, amount));
    }
    await safeDeleteMessage(ctx);
    return;
  }

  if (data.startsWith("manual_res_page_")) {
    const pageStr = data.split("_")[3];
    if (pageStr === "none") return await ctx.answerCbQuery();
    const page = parseInt(pageStr);
    const manualData = userManualBet[userId];
    if (!manualData || !manualData.results) return await ctx.answerCbQuery("Results expired.");
    const text = formatManualResultsPage(manualData.results, page, manualData.timeLeft || "N/A");
    const keyboard = makeManualResPageKeyboard(page);
    try { await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: keyboard.reply_markup }); } catch (e) {}
    return;
  }

  if (data.startsWith("manual_mult_")) {
    const parts = data.split("_");
    if (parts[2] === "custom") {
      const choice = parts[3];
      const amount = parseInt(parts[4]);
      userState[userId] = { state: "INPUT_MANUAL_CUSTOM_MULT", choice, amount };
      await sendMessageWithRetry(ctx, `${EMOJI.RISK} Enter custom multiplier (e.g., 10):`);
    } else {
      const mult = parseInt(parts[2]);
      const choice = parts[3];
      const amount = parseInt(parts[4]);
      await sendMessageWithRetry(ctx, `${EMOJI.RISK} Multiplier: *${mult}x*\n\n${EMOJI.WARNING} Confirm your bet:`, makeManualConfirmKeyboard(choice, amount, mult));
    }
    await safeDeleteMessage(ctx);
    return;
  }

  if (data.startsWith("manual_confirm_")) {
    const parts = data.split("_");
    const choice = parts[2];
    const amount = parseInt(parts[3]);
    const multiplier = parseInt(parts[4]);
    const totalAmount = amount * multiplier;
    const isColorChoice = ['G', 'R', 'V'].includes(choice);
    const betTypeForThisBet = isColorChoice ? "COLOR" : "BS";
    
    let choiceText;
    if (choice === 'B') choiceText = 'BIG';
    else if (choice === 'S') choiceText = 'SMALL';
    else if (choice === 'G') choiceText = 'GREEN 🟢';
    else if (choice === 'R') choiceText = 'RED 🔴';
    else if (choice === 'V') choiceText = 'VIOLET 🟣';
    else choiceText = choice;

    const gameType = userManualBet[userId]?.gameType || userSettings[userId]?.game_type || "WINGO";
    const settings = userSettings[userId] || {};
    const isVirtual = settings.virtual_mode || false;
    
    await safeDeleteMessage(ctx);

    const selectType = getSelectMap(gameType, betTypeForThisBet)[choice];
    const { unitAmount, betCount, actualAmount } = computeBetDetails(totalAmount);
    
    if (isVirtual) {
      const resultNum = Math.floor(Math.random() * 10);
      const resultColor = numberToColor(resultNum);
      let isWin;
      if (isColorChoice) isWin = (choice === resultColor);
      else isWin = (choice === 'B' && resultNum >= 5) || (choice === 'S' && resultNum < 5);
      const resultBS = resultNum >= 5 ? "B" : "S";
      const profit = isWin ? (actualAmount * 0.96) : -actualAmount;
      if (isWin) userStats[userId].virtual_balance = (userStats[userId].virtual_balance || 0) + (actualAmount * 0.96);
      else userStats[userId].virtual_balance = (userStats[userId].virtual_balance || 0) - actualAmount;
      
      if (!userManualBets[userId]) userManualBets[userId] = [];
      userManualBets[userId].push({ choice, betType: betTypeForThisBet, amount: actualAmount, result: `${resultNum}(${resultBS}/${resultColor})`, isWin, profit });
      if (userManualBets[userId].length > 20) userManualBets[userId] = userManualBets[userId].slice(-20);
      
      const colorEmoji = resultColor === 'G' ? '🟢' : resultColor === 'R' ? '🔴' : '🟣';
      const resultLine = isColorChoice ? `Result: ${resultNum} ${colorEmoji} ${getColorName(resultColor)}` : `Result: ${resultNum} (${resultBS})`;
      
      const msg = isWin 
        ? `${EMOJI.WIN} *VICTORY!* +${(actualAmount * 0.96).toFixed(2)} Ks\n${STYLE.SEPARATOR}\nBet: ${choiceText} | ${resultLine}`
        : `${EMOJI.LOSS} *LOSS* -${actualAmount.toFixed(2)} Ks\n${STYLE.SEPARATOR}\nBet: ${choiceText} | ${resultLine}`;
      
      await sendMessageWithRetry(ctx, msg, makeManualBetMenuKeyboard());
    } else {
      const session = userSessions[userId];
      const issueRes = await getGameIssueRequest(session, gameType);
      if (!issueRes || issueRes.code !== 0) return await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Failed to get current issue period.`, makeManualBetMenuKeyboard());
      const currentIssue = issueRes.data?.issueNumber || issueRes.data?.predraw?.issueNumber;
      
      await sendMessageWithRetry(ctx, `${EMOJI.LOADING} Placing bet...`);
      const betResp = await placeBetRequest(session, currentIssue, selectType, unitAmount, betCount, gameType, parseInt(userId));
      
      if (betResp.error || betResp.code !== 0) return await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Bet failed: ${betResp.msg || betResp.error}`, makeManualBetMenuKeyboard());
      
      if (!userManualBets[userId]) userManualBets[userId] = [];
      userManualBets[userId].push({
        status: "PENDING", period: currentIssue, choice,
        betType: betTypeForThisBet, amount: actualAmount,
        result: null, isWin: null, profit: null
      });
      if (userManualBets[userId].length > 20) userManualBets[userId] = userManualBets[userId].slice(-20);
      
      await sendMessageWithRetry(ctx, 
        `${EMOJI.SUCCESS} *Bet Placed Successfully!*\n${STYLE.SEPARATOR}\nBet: ${choiceText} | Amount: ${actualAmount} Ks\nPeriod: \`${currentIssue}\`\n\n${EMOJI.WAIT} Result will be checked automatically...`, 
        makeManualBetMenuKeyboard()
      );
    }
    return;
  }

  if (data === "manual_cancel") {
    await safeDeleteMessage(ctx);
    await sendMessageWithRetry(ctx, `${EMOJI.INFO} Bet cancelled.`, makeManualBetMenuKeyboard());
    return;
  }

  if (data.startsWith("game_type:") && userManualBet[userId]) {
    const gameType = data.split(":")[1];
    if (gameType === "WINGO_SELECT") {
      await sendMessageWithRetry(ctx, `${EMOJI.GAME} Select WINGO Game Type:`, makeWINGOSelectionKeyboard());
      await safeDeleteMessage(ctx);
      return;
    }
    userManualBet[userId].gameType = gameType;
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} Manual Bet Game Type set to ${gameType}`, makeManualBetMenuKeyboard());
    await safeDeleteMessage(ctx);
    return;
  }
  
  await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid action.`, makeMainKeyboard(true, isAdmin(userId)));
}

async function textMessageHandler(ctx) {
  const userId = ctx.from.id;
  const userName = ctx.from.username || ctx.from.first_name || "Unknown";
  const rawText = ctx.message.text;
  const isAdminUser = isAdmin(userId);
  const buttonText = rawText.trim();

  for (const [platformKey, platform] of Object.entries(PLATFORMS)) {
    if (buttonText === `${platform.color} ${platform.name}`) {
      userState[userId] = { state: "PLATFORM_SELECTED", platform: platformKey };
      await sendMessageWithRetry(ctx,
        `${platform.color} ${STYLE.BOLD(`Selected: ${platform.name}`)}\n\n${EMOJI.LOGIN} Please login using the format:\n\n${STYLE.CODE('phone')}\n${STYLE.CODE('password')}`,
        Markup.keyboard([[{ text: `${EMOJI.BACK} Back`, style: 'primary' }]]).resize().oneTime(false)
      );
      return;
    }
  }

  if (isAdminUser) {
    if (buttonText === `${EMOJI.STATS} User Stats` || buttonText === "User Stats") { ctx.message.text = "/users"; await cmdUsersHandler(ctx); return; }
    if (buttonText === `${EMOJI.MENU} Allowed IDs` || buttonText === "Allowed IDs") { ctx.message.text = "/showid"; await cmdShowIdHandler(ctx); return; }
    if (buttonText === `${EMOJI.ADD} Add User` || buttonText === "Add User") { userState[userId] = { state: "ADMIN_ADD_USER" }; await sendMessageWithRetry(ctx, `${EMOJI.ADD} Enter user ID to add:`, makeAdminPanelKeyboard(userId)); return; }
    if (buttonText === `${EMOJI.REMOVE} Remove User` || buttonText === "Remove User") { userState[userId] = { state: "ADMIN_REMOVE_USER" }; await sendMessageWithRetry(ctx, `${EMOJI.REMOVE} Enter user ID to remove:`, makeAdminPanelKeyboard(userId)); return; }
    if (buttonText === `${EMOJI.BROADCAST} Broadcast` || buttonText === "Broadcast") { userState[userId] = { state: "ADMIN_BROADCAST" }; await sendMessageWithRetry(ctx, `${EMOJI.BROADCAST} Enter broadcast message:`, makeAdminPanelKeyboard(userId)); return; }
    if (buttonText === "👥 Add Admin") {
      if (userId !== ADMIN_ID) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Only owner.`, makeAdminPanelKeyboard(userId)); return; }
      userState[userId] = { state: "ADMIN_ADD_ADMIN" };
      await sendMessageWithRetry(ctx, `${EMOJI.ADD} Enter Telegram user ID:`, makeAdminPanelKeyboard(userId));
      return;
    }
    if (buttonText === "❌ Remove Admin") {
      if (userId !== ADMIN_ID) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Only owner.`, makeAdminPanelKeyboard(userId)); return; }
      userState[userId] = { state: "ADMIN_REMOVE_ADMIN" };
      await sendMessageWithRetry(ctx, `${EMOJI.REMOVE} Enter Telegram user ID:`, makeAdminPanelKeyboard(userId));
      return;
    }
    if (buttonText === "📋 List Admins") {
      if (userId !== ADMIN_ID) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Only owner.`, makeAdminPanelKeyboard(userId)); return; }
      let msg = `${EMOJI.MENU} *Admin List*\n${STYLE.SEPARATOR}\n`;
      const sorted = Array.from(adminSet).sort((a,b)=>a-b);
      sorted.forEach(id => { msg += `${id === ADMIN_ID ? '👑 Owner' : '👤 Admin'}: \`${id}\`\n`; });
      msg += `\nTotal: ${sorted.length} admin(s)`;
      await sendMessageWithRetry(ctx, msg, makeAdminPanelKeyboard(userId));
      return;
    }
    if (buttonText === `${EMOJI.MENU} Main Menu` || buttonText === "Main Menu") {
      const loggedIn = !!userSessions[userId];
      await sendMessageWithRetry(ctx, `${EMOJI.MENU} Returning...`, makeMainKeyboard(loggedIn, isAdminUser));
      return;
    }
  }

  if (buttonText === `${EMOJI.ADMIN} Admin Panel` || buttonText === "Admin Panel") {
    if (isAdminUser) await sendMessageWithRetry(ctx, `${EMOJI.ADMIN} ${STYLE.BOLD('Admin Panel')}\n\n${EMOJI.INFO} Select an admin action:`, makeAdminPanelKeyboard(userId));
    else await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Admin only!`, makeMainKeyboard(true, false));
    return;
  }
  
  if (isAdminUser && userState[userId]?.state === "ADMIN_ADD_USER") {
    const userIdToAdd = rawText.trim();
    if (!userIdToAdd.match(/^\d+$/)) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid user ID.`, makeAdminPanelKeyboard(userId)); return; }
    ctx.message.text = `/allow ${userIdToAdd}`;
    await cmdAllowHandler(ctx);
    delete userState[userId];
    return;
  }
  
  if (isAdminUser && userState[userId]?.state === "ADMIN_REMOVE_USER") {
    const userIdToRemove = rawText.trim();
    if (!userIdToRemove.match(/^\d+$/)) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid user ID.`, makeAdminPanelKeyboard(userId)); return; }
    ctx.message.text = `/remove ${userIdToRemove}`;
    await cmdRemoveHandler(ctx);
    delete userState[userId];
    return;
  }
  
  if (isAdminUser && userState[userId]?.state === "ADMIN_BROADCAST") {
    const messageToSend = rawText.trim();
    if (!messageToSend) { await sendMessageWithRetry(ctx, `${EMOJI.INFO} Please provide a message.`, makeAdminPanelKeyboard(userId)); delete userState[userId]; return; }
    try {
      const telegramUserIds = Array.from(activeUsers);
      if (telegramUserIds.length === 0) { await sendMessageWithRetry(ctx, `${EMOJI.INFO} No active users.`, makeAdminPanelKeyboard(userId)); delete userState[userId]; return; }
      let successCount = 0;
      const broadcastMessage = `${EMOJI.BROADCAST} ${STYLE.BOLD('Admin Broadcast:')}\n\n${messageToSend}`;
      for (const telegramId of telegramUserIds) {
        try { await ctx.telegram.sendMessage(telegramId, broadcastMessage, { parse_mode: 'Markdown' }); successCount++; } catch (error) {}
      }
      await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} Message sent to ${successCount} users`, makeAdminPanelKeyboard(userId));
    } catch (error) {
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Error.`, makeAdminPanelKeyboard(userId));
    }
    delete userState[userId];
    return;
  }
  
  if (isAdminUser && userState[userId]?.state === "ADMIN_ADD_ADMIN") {
    const adminId = parseInt(rawText.trim());
    if (isNaN(adminId)) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid.`, makeAdminPanelKeyboard(userId)); delete userState[userId]; return; }
    if (adminSet.has(adminId)) await sendMessageWithRetry(ctx, `${EMOJI.INFO} Already admin.`, makeAdminPanelKeyboard(userId));
    else { adminSet.add(adminId); saveAdmins(); await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} Admin ${adminId} added.`, makeAdminPanelKeyboard(userId)); }
    delete userState[userId];
    return;
  }
  
  if (isAdminUser && userState[userId]?.state === "ADMIN_REMOVE_ADMIN") {
    const adminId = parseInt(rawText.trim());
    if (isNaN(adminId)) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid.`, makeAdminPanelKeyboard(userId)); delete userState[userId]; return; }
    if (adminId === ADMIN_ID) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Cannot remove owner.`, makeAdminPanelKeyboard(userId)); delete userState[userId]; return; }
    if (!adminSet.has(adminId)) await sendMessageWithRetry(ctx, `${EMOJI.INFO} Not admin.`, makeAdminPanelKeyboard(userId));
    else { adminSet.delete(adminId); saveAdmins(); await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} Admin ${adminId} removed.`, makeAdminPanelKeyboard(userId)); }
    delete userState[userId];
    return;
  }
  
  if (isAdminUser && rawText.startsWith("/allow ")) { await cmdAllowHandler(ctx); return; }
  if (isAdminUser && rawText.startsWith("/remove ")) { await cmdRemoveHandler(ctx); return; }
  if (isAdminUser && rawText.startsWith("/send ")) { await cmdSendHandler(ctx); return; }

  if (buttonText === `📖 Tutorial`) {
    const tutorialMessage = 
      `📖 *TUTORIAL — အသုံးပြုနည်း*\n${STYLE.SEPARATOR}\n\n` +
      `*၁။ 🔐 Login လုပ်နည်း*\n${STYLE.ITEM('Login Button ကို နှိပ်ပါ')}\n${STYLE.ITEM('Site ၂ ခု ထဲက တစ်ခု ရွေးပါ')}\n${STYLE.ITEM('Phone နံပါတ် ရိုက်ပါ')}\n${STYLE.ITEM('Password ရိုက်ပါ')}\n${STYLE.LAST_ITEM('ပြီးရင် Login လုပ်ပါမယ်')}\n\n` +
      `⚠️ *အရေးကြီး:* Phone နဲ့ Password ကို လိုင်းနှစ်လိုင်းနဲ့ ပို့ပါ\n${STYLE.CODE('9782663611')}\n${STYLE.CODE('Password123')}\n\n${STYLE.SEPARATOR}\n\n` +
      `*၂။ 🤹 Bet_Wrager သတ်မှတ်နည်း*\n${STYLE.ITEM('Bet_Wrager Button ကို နှိပ်ပါ')}\n${STYLE.ITEM('ငွေပမာဏတွေ ရိုက်ပါ')}\n${STYLE.ITEM('Skip လုပ်ချင်ရင် 0 ရိုက်ပါ')}\n${STYLE.LAST_ITEM('အကုန်လောင်းချင်ရင် ALL IN ရိုက်ပါ')}\n\n${STYLE.SEPARATOR}\n\n` +
      `*၃။ 🎯 Game Type ရွေးနည်း*\n${STYLE.ITEM('Game Type Button ကို နှိပ်ပါ')}\n${STYLE.ITEM('WINGO သို့ TRX ရွေးပါ')}\n${STYLE.LAST_ITEM('WINGO မှာ 30s, 1m, 3m, 5m ရှိတယ်')}\n\n${STYLE.SEPARATOR}\n\n` +
      `*၄။ 🧬 Strategy ရွေးနည်း*\n${STYLE.ITEM('Strategy Button ကို နှိပ်ပါ')}\n${STYLE.ITEM('ကြိုက်တဲ့ Strategy ရွေးပါ')}\n${STYLE.LAST_ITEM('TREND_FOLLOW, ALTERNATE, BS_ORDER, LEO, Dream, CHAT GPT V1')}\n\n${STYLE.SEPARATOR}\n\n` +
      `*၅။ ▶️ Bot စတင်နည်း*\n${STYLE.ITEM('Activate Button ကို နှိပ်ပါ')}\n${STYLE.ITEM('Bot က Auto လောင်းပါမယ်')}\n${STYLE.LAST_ITEM('ရပ်ချင်ရင် Deactivate နှိပ်ပါ')}\n\n${STYLE.SEPARATOR}\n\n` +
      `*၆။ 🩰 Risk Management*\n${STYLE.ITEM('Profit Target — အမြတ်ရင် ရပ်')}\n${STYLE.ITEM('Stop Loss — အရှုံးများရင် ရပ်')}\n${STYLE.ITEM('Entry Layer — စတင်ချိန်')}\n${STYLE.LAST_ITEM('SL Layer — ရှုံးရင် ရပ်ချိန်')}\n\n${STYLE.SEPARATOR}\n\n` +
      `*၇။ 📊 Daily Report*\n${STYLE.ITEM('ဒီနေ့ Win/Loss ကြည့်နိုင်')}\n${STYLE.ITEM('Win Rate % ကြည့်နိုင်')}\n${STYLE.LAST_ITEM('Profit/Loss ကြည့်နိုင်')}\n\n${STYLE.SEPARATOR}\n\n` +
      `*၈။ 🤹 Manual Bet*\n${STYLE.ITEM('Manual Bet Button ကို နှိပ်ပါ')}\n${STYLE.ITEM('BIG/SMALL (သို့) Color ရွေးပါ')}\n${STYLE.ITEM('ပမာဏ ရွေးပါ')}\n${STYLE.LAST_ITEM('Multiplier ရွေးပြီး အတည်ပြုပါ')}\n\n${STYLE.SEPARATOR}\n\n` +
      `💡 *အကြံပြုချက်:*\n${STYLE.ITEM('Virtual Mode နဲ့ အရင် စမ်းပါ')}\n${STYLE.ITEM('Strategy ကောင်းတာ သေချာမှ Real သုံး')}\n${STYLE.LAST_ITEM('Profit Target သတ်မှတ်ထားပါ')}\n\n${STYLE.SEPARATOR}\n` +
      `${EMOJI.INFO} *Support:* https://t.me/Super_Rikooo`;

    await sendMessageWithRetry(ctx, tutorialMessage, makeMainKeyboard(!!userSessions[userId], isAdminUser));
    return;
  }

  if (buttonText === `📅 Daily Report`) {
    const stats = safeGetUserStats(userId);
    const todayStr = new Date().toDateString();
    let wins = 0, losses = 0, profit = 0;
    if (stats.daily_date === todayStr) {
      wins = stats.daily_wins || 0;
      losses = stats.daily_losses || 0;
      profit = stats.daily_profit || 0;
    } else {
      stats.daily_date = todayStr;
      stats.daily_wins = 0;
      stats.daily_losses = 0;
      stats.daily_profit = 0;
      stats.daily_start_balance = 0;
    }
    const total = wins + losses;
    const winRate = total > 0 ? ((wins / total) * 100).toFixed(1) : "0.0";
    const reportMessage = 
      `📅 *DAILY REPORT*\n${STYLE.SEPARATOR}\n📆 Date: ${todayStr}\n\n🏆 Wins: ${wins}\n❌ Losses: ${losses}\n📈 Win Rate: ${winRate}%\n💰 Profit: ${profit >= 0 ? '+' : ''}${profit.toFixed(2)} Ks\n📊 Total Bets: ${total}\n${STYLE.SEPARATOR}`;
    await sendMessageWithRetry(ctx, reportMessage, makeMainKeyboard(true, isAdminUser));
    return;
  }
  
  if (buttonText === `${EMOJI.INFO} Account Info`) { await showUserStats(ctx, userId); return; }
  if (buttonText === `${EMOJI.TARGET} Game Type`) { await sendMessageWithRetry(ctx, `${EMOJI.GAME} Select Game Type:`, makeGameTypeKeyboard()); return; }
  if (buttonText === `${EMOJI.TARGET} Profit Target`) { userState[userId] = { state: "INPUT_PROFIT_TARGET" }; await sendMessageWithRetry(ctx, `${EMOJI.TARGET} ${STYLE.BOLD('Profit Target Settings')}\n\n${EMOJI.INFO} Enter profit target (in Ks):\n\n${STYLE.CODE('Example: 10000')}`); return; }
  if (buttonText === `${EMOJI.STOP} Stop Loss`) { userState[userId] = { state: "INPUT_STOP_LIMIT" }; await sendMessageWithRetry(ctx, `${EMOJI.STOP} ${STYLE.BOLD('Stop Loss Settings')}\n\n${EMOJI.INFO} Enter stop loss (in Ks):\n\n${STYLE.CODE('Example: 5000')}`); return; }
  if (buttonText === `${EMOJI.LAYER} Entry Layer`) { await sendMessageWithRetry(ctx, `${EMOJI.LAYER} ${STYLE.BOLD('Entry Layer Settings')}\n\n${EMOJI.INFO} Select when to start betting:`, makeEntryLayerKeyboard()); return; }
  if (buttonText === `${EMOJI.WARNING} Bet SL`) { await sendMessageWithRetry(ctx, `${EMOJI.WARNING} ${STYLE.BOLD('Stop Loss Layer Settings')}\n\n${EMOJI.INFO} Select consecutive losses:`, makeSLLayerKeyboard()); return; }
  if (buttonText === `${EMOJI.BACK} Back`) {
    if (userState[userId]?.state === "PLATFORM_SELECTED") {
      delete userState[userId];
      const loggedIn = !!userSessions[userId];
      await sendMessageWithRetry(ctx, `${EMOJI.BACK} Returning...`, makeMainKeyboard(loggedIn, isAdminUser));
      return;
    }
    const isOnPlatformKeyboard = Object.values(PLATFORMS).some(p =>
      buttonText.includes(p.name) || buttonText.includes(p.color)
    );
    if (isOnPlatformKeyboard) {
      const loggedIn = !!userSessions[userId];
      await sendMessageWithRetry(ctx, `${EMOJI.BACK} Returning...`, makeMainKeyboard(loggedIn, isAdminUser));
    } else {
      const loggedIn = !!userSessions[userId];
      if (!loggedIn) {
        await sendMessageWithRetry(ctx, `${EMOJI.LOGIN} ${STYLE.BOLD('Select Platform')}\n\n${EMOJI.INFO} Choose your lottery platform:`, makePlatformKeyboard());
      } else {
        await sendMessageWithRetry(ctx, `${EMOJI.BACK} Returning...`, makeMainKeyboard(loggedIn, isAdminUser));
      }
    }
    delete userState[userId];
    return;
  }
  if (buttonText === `${EMOJI.RISK} Risk Management`) { await sendMessageWithRetry(ctx, `${EMOJI.RISK} ${STYLE.BOLD('Risk Management')}\n\n${EMOJI.INFO} Configure safety settings:`, makeRiskManagementSubmenu()); return; }
  
  if (buttonText === `${EMOJI.START} Activate`) {
    const settings = userSettings[userId] || {};
    if (!settings.bet_sizes) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Please set Bet_Wrager first!`, makeMainKeyboard(true, isAdminUser)); return; }
    if (settings.running) { await sendMessageWithRetry(ctx, `${EMOJI.INFO} Bot is already running!`, makeMainKeyboard(true, isAdminUser)); return; }
    settings.running = true;
    settings.consecutive_errors = 0;
    saveUserSettings();
    
    const entryLayer = settings.layer_limit || 1;
    if (entryLayer === 2) settings.entry_layer_state = { waiting_for_lose: true };
    else if (entryLayer === 3) settings.entry_layer_state = { waiting_for_loses: true, consecutive_loses: 0 };
    
    if (settings.strategy === "TREND_FOLLOW") {
      const betType = settings.bet_type || "BS";
      if (betType === "COLOR") settings.color_trend_state = { last_result: null };
      else settings.trend_state = { last_result: null, skip_mode: false };
    }
    if (settings.strategy === "ALTERNATE") settings.alternate_state = { last_result: null, skip_mode: false };
    if (settings.strategy === "COLOR_SNIPER") {
      settings.color_sniper_state = { active: false, step: 0, hit_count: 0, waiting_for_trigger: true };
      settings.sniper_hit_count = 0;
      settings.sniper_loss_count = 0;
    }
    if (settings.strategy === "LEO") {
      settings.leo_state = { last_result: null, pattern_index: 0 };
    }
    if (settings.strategy === "DREAM") {
      settings.dream_state = { first_bet: true, current_pattern: "", current_index: 0 };
    }
    if (settings.strategy === "CHAT_GPT_V1") {
      userAILast10Results[userId] = [];
      userAIRoundCount[userId] = 0;
    }
    
    delete userSkippedBets[userId];
    userShouldSkipNext[userId] = false;
    delete userSLSkipWaitingForWin[userId];
    userWaitingForResult[userId] = false;
    
    bettingWorker(userId, ctx, ctx.telegram);
    return;
  }
  
  if (buttonText === `${EMOJI.STOP} Deactivate`) {
    const settings = userSettings[userId] || {};
    if (!settings.running) { await sendMessageWithRetry(ctx, `${EMOJI.INFO} Bot is not running!`, makeMainKeyboard(true, isAdminUser)); return; }
    userStopInitiated[userId] = true;
    settings.running = false;
    delete userWaitingForResult[userId];
    delete userShouldSkipNext[userId];
    delete userSLSkipWaitingForWin[userId];
    saveUserSettings();
    
    if (settings.strategy === "TREND_FOLLOW") { delete settings.trend_state; delete settings.color_trend_state; }
    if (settings.strategy === "ALTERNATE") delete settings.alternate_state;
    if (settings.strategy === "COLOR_SNIPER") delete settings.color_sniper_state;
    if (settings.strategy === "LEO") delete settings.leo_state;
    if (settings.strategy === "DREAM") delete settings.dream_state;
    if (settings.strategy === "CHAT_GPT_V1") {
      delete userAILast10Results[userId];
      delete userAIRoundCount[userId];
    }
    
    let totalProfit = 0;
    let balanceText = "";
    if (settings.virtual_mode) {
      totalProfit = (userStats[userId]?.virtual_balance || 0) - (userStats[userId]?.initial_balance || 0);
      balanceText = `${EMOJI.VIRTUAL} Virtual Balance: ${(userStats[userId]?.virtual_balance || 0).toFixed(2)} Ks\n`;
    } else {
      totalProfit = userStats[userId]?.profit || 0;
      try {
        const finalBalance = await getBalance(userSessions[userId], parseInt(userId));
        balanceText = `${EMOJI.BALANCE} Final Balance: ${finalBalance?.toFixed(2) || '0.00'} Ks\n`;
      } catch (error) { balanceText = `${EMOJI.BALANCE} Final Balance: Unknown\n`; }
    }
    const profitIndicator = totalProfit > 0 ? "+" : (totalProfit < 0 ? "-" : "");
    delete userStats[userId];
    settings.martin_index = 0; settings.dalembert_units = 1; settings.custom_index = 0;
    saveUserSettings();
    const message = `${EMOJI.STOP} ${STYLE.BOLD('SESSION TERMINATED')}\n${balanceText}${EMOJI.PROFIT} Total Profit: ${profitIndicator}${totalProfit.toFixed(2)} Ks`;
    await sendMessageWithRetry(ctx, message, makeMainKeyboard(true, isAdminUser));
    return;
  }
  
  if (buttonText === `${EMOJI.BETWRAGER} Bet_Wrager`) { userState[userId] = { state: "INPUT_BET_SIZES" }; await sendMessageWithRetry(ctx, `${EMOJI.BALANCE} Enter Bet_Wragers (one per line):\n${STYLE.CODE('0')} (Skip)\n${STYLE.CODE('100')}\n${STYLE.CODE('ALL IN')}`, makeMainKeyboard(true, isAdminUser)); return; }
  if (buttonText === `${EMOJI.STRATEGY} Strategy`) { await sendMessageWithRetry(ctx, `${EMOJI.STRATEGY} Choose strategy:`, makeStrategyKeyboard(userId)); return; }
  if (buttonText === `${EMOJI.SETTINGS} Betting Settings`) { await sendMessageWithRetry(ctx, `${EMOJI.SETTINGS} Choose Betting Strategy`, makeBettingStrategyKeyboard()); return; }
  if (buttonText === `${EMOJI.GAME} Game Mode`) { await sendMessageWithRetry(ctx, `${EMOJI.GAME} Select Mode:`, makeModeSelectionKeyboard()); return; }
  if (buttonText === `${EMOJI.COLOR} Bet Type`) {
    const currentBetType = userSettings[userId]?.bet_type || "BS";
    const typeText = currentBetType === "COLOR" ? "Color" : "Big/Small";
    await sendMessageWithRetry(ctx, `${EMOJI.COLOR} ${STYLE.BOLD('Bet Type Settings')}\n\n${EMOJI.INFO} Current: ${STYLE.BOLD(typeText)}\n${EMOJI.INFO} Select:`, makeBetTypeKeyboard());
    return;
  }
  
  if (buttonText === `${EMOJI.LOGIN} Login`) {
    await sendMessageWithRetry(ctx, `${EMOJI.LOGIN} ${STYLE.BOLD('Select Platform')}\n\n${EMOJI.INFO} Choose your lottery platform:`, makePlatformKeyboard());
    return;
  }
  
  if (buttonText === `${EMOJI.LOGOUT} Re-Login`) {
    delete userSessions[userId];
    delete userGameInfo[userId];
    delete userStats[userId];
    delete userLastResults[userId];
    delete userPlatforms[userId];
    await sendMessageWithRetry(ctx, `${EMOJI.LOGIN} ${STYLE.BOLD('Select Platform')}\n\n${EMOJI.INFO} Choose your lottery platform:`, makePlatformKeyboard());
    return;
  }
  
  const text = normalizeText(rawText);
  const lines = text.split('\n').map(line => line.trim()).filter(line => line);
  
  if (userState[userId]?.state === "PLATFORM_SELECTED" && lines.length >= 2) {
    const platformKey = userState[userId].platform;
    const platform = PLATFORMS[platformKey];
    const phone = lines[0];
    const password = lines[1];
    try { await ctx.deleteMessage(); } catch (delErr) {}
    activeUsers.add(userId);
    await sendMessageWithRetry(ctx, `${EMOJI.LOADING} Logging into ${platform.name}...`);
    userPlatforms[userId] = platformKey;
    
    const { response: res, session } = await loginRequest(phone, password, platform.baseUrl);
    
    if (session) {
      const userInfo = await getUserInfo(session, userId);
      if (userInfo && userInfo.user_id) {
        const gameUserId = userInfo.user_id;
        if (!allowedsixlotteryIds.has(gameUserId)) {
          await sendMessageWithRetry(ctx,
            `${EMOJI.ERROR} ${STYLE.BOLD('အသုံးပြုခွင့်မရရှိသေးပါ.')}\n\n${EMOJI.INFO} ကျေးဇူးပြုပြီး အက်ဒမင်ကိုဆက်သွယ်ပါ @Super\\_Rikooo:\n${STYLE.ITEM(`Your ID: ${STYLE.CODE(gameUserId.toString())}`)}`,
            makeMainKeyboard(false, isAdminUser)
          );
          return;
        }
        
        userSessions[userId] = session;
        userGameInfo[userId] = userInfo;
        userTemp[userId] = { password, platform: platformKey };
        userCredentials[userId] = { phone, password, platform: platformKey };
        userAllResults[userId] = [];
        userLastResults[userId] = [];
        
        const balance = await getBalance(session, parseInt(userId));
        
        if (!userSettings[userId]) {
          userSettings[userId] = {
            platform: platformKey, strategy: "TREND_FOLLOW", betting_strategy: "Martingale",
            game_type: platformKey === "CKLOTTERY" ? "TRX" : "WINGO", bet_type: "BS",
            martin_index: 0, dalembert_units: 1, pattern_index: 0, running: false,
            consecutive_losses: 0, current_layer: 0, skip_betting: false, sl_layer: null,
            original_martin_index: 0, original_dalembert_units: 1, original_custom_index: 0,
            custom_index: 0, layer_limit: 1, virtual_mode: false, bs_sb_wait_count: 0, bb_ss_wait_count: 0
          };
        } else userSettings[userId].platform = platformKey;
        
        if (!userStats[userId]) {
          userStats[userId] = {
            start_balance: parseFloat(balance || 0), profit: 0.0,
            daily_date: new Date().toDateString(),
            daily_wins: 0, daily_losses: 0, daily_profit: 0, daily_start_balance: 0
          };
        }
        
        const balanceDisplay = balance !== null ? balance : 0.0;
        const loginMessage = `${platform.color} ${STYLE.BOLD(`${platform.name} Login Successful`)}\n\n${EMOJI.USER} ${STYLE.BOLD('User ID:')} ${STYLE.CODE(userInfo.user_id.toString())}\n${EMOJI.BALANCE} ${STYLE.BOLD('Balance:')} ${balanceDisplay} Ks\n\n${EMOJI.START} Welcome back! Configure your settings.`;
        await sendMessageWithRetry(ctx, loginMessage, makeMainKeyboard(true, isAdminUser));
        saveUserSettings();
      } else {
        await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Login failed: Could not get user info`, makeMainKeyboard(false, isAdminUser));
      }
    } else {
      const msg = res.msg || "Login failed";
      await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Login error: ${msg}`, makeMainKeyboard(false, isAdminUser));
    }
    delete userState[userId];
    delete userTemp[userId];
    return;
  }

  if (buttonText === `${EMOJI.BET} Manual Bet`) {
    if (!await checkUserAuthorized(ctx)) return;
    userManualBet[userId] = { gameType: userSettings[userId]?.game_type || "WINGO" };
    await sendMessageWithRetry(ctx, `${EMOJI.BET} ${STYLE.BOLD('MANUAL BET MODE')}\n\n${EMOJI.INFO} Select BIG/SMALL or Color.`, makeManualBetMenuKeyboard());
    return;
  }

  if (buttonText === `${EMOJI.RESULT} BIG`) { await sendMessageWithRetry(ctx, `${EMOJI.RESULT} Selected: *BIG*\n\n${EMOJI.BALANCE} Select Bet Amount:`, makeManualAmountKeyboard('B')); return; }
  if (buttonText === `${EMOJI.RESULT} SMALL`) { await sendMessageWithRetry(ctx, `${EMOJI.RESULT} Selected: *SMALL*\n\n${EMOJI.BALANCE} Select Bet Amount:`, makeManualAmountKeyboard('S')); return; }
  if (buttonText === `🟢 GREEN`) { await sendMessageWithRetry(ctx, `🟢 Selected: *GREEN*\n\n${EMOJI.BALANCE} Select Bet Amount:`, makeManualAmountKeyboard('G')); return; }
  if (buttonText === `🔴 RED`) { await sendMessageWithRetry(ctx, `🔴 Selected: *RED*\n\n${EMOJI.BALANCE} Select Bet Amount:`, makeManualAmountKeyboard('R')); return; }
  if (buttonText === `🟣 VIOLET`) { await sendMessageWithRetry(ctx, `🟣 Selected: *VIOLET*\n\n${EMOJI.BALANCE} Select Bet Amount:`, makeManualAmountKeyboard('V')); return; }

  if (buttonText === `${EMOJI.BALANCE} My Balance`) {
    if (!userSessions[userId]) return await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Login first!`);
    await sendMessageWithRetry(ctx, `${EMOJI.LOADING} Fetching balance...`);
    const balance = await getBalance(userSessions[userId], parseInt(userId));
    const balText = balance !== null ? `${balance.toFixed(2)} Ks` : "Failed to fetch";
    await sendMessageWithRetry(ctx, `${EMOJI.BALANCE} *Current Balance:*\n\n${STYLE.SEPARATOR}\n${EMOJI.REAL} ${balText}`, makeManualBetMenuKeyboard());
    return;
  }

  if (buttonText === `${EMOJI.RESULTSBS} Game Results`) {
    if (!userSessions[userId]) return await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Login first!`);
    await sendMessageWithRetry(ctx, `${EMOJI.LOADING} Fetching last 20 results...`);
    const gameType = userManualBet[userId]?.gameType || userSettings[userId]?.game_type || "WINGO";
    let results;
    if (gameType === "TRX") {
      const trxResults = await getTrxPublicResults();
      results = trxResults ? trxResults.slice(0, 20) : null;
    } else results = await getGameResults20(userSessions[userId], gameType);
    const timeLeft = await getNextPeriodTimeLeft(userSessions[userId], gameType);
    if (!results || results.length === 0) return await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Failed to fetch results.`, makeManualBetMenuKeyboard());
    userManualBet[userId].results = results;
    userManualBet[userId].resPage = 1;
    userManualBet[userId].timeLeft = timeLeft;
    const msg = formatManualResultsPage(results, 1, timeLeft);
    await sendMessageWithRetry(ctx, msg, makeManualResPageKeyboard(1));
    return;
  }

  if (buttonText === `${EMOJI.BET} My Bets`) {
    const bets = userManualBets[userId] || [];
    if (bets.length === 0) return await sendMessageWithRetry(ctx, `${EMOJI.INFO} No manual bets placed yet.`, makeManualBetMenuKeyboard());
    let msg = `${EMOJI.BET} *My Recent 20 Bets*\n${STYLE.SEPARATOR}\n`;
    bets.slice(-20).reverse().forEach(b => {
      let choiceText;
      if (b.choice === 'B') choiceText = 'BIG';
      else if (b.choice === 'S') choiceText = 'SMALL';
      else if (b.choice === 'G') choiceText = 'GREEN';
      else if (b.choice === 'R') choiceText = 'RED';
      else if (b.choice === 'V') choiceText = 'VIOLET';
      else choiceText = b.choice;
      if (b.status === "PENDING") msg += `⏳ ${choiceText} | ${b.amount} Ks | Per: ${b.period ? String(b.period).slice(-8) : '...'} | *PENDING*\n`;
      else {
        const statusEmoji = b.isWin ? EMOJI.WIN : EMOJI.LOSS;
        msg += `${statusEmoji} ${choiceText} | ${b.amount} Ks | Res: ${b.result} | P/L: ${b.isWin ? '+' : '-'}${b.profit.toFixed(2)} Ks\n`;
      }
    });
    await sendMessageWithRetry(ctx, msg, makeManualBetMenuKeyboard());
    return;
  }

  if (buttonText === `${EMOJI.GAME} Game Type` && userManualBet[userId]) { await sendMessageWithRetry(ctx, `${EMOJI.GAME} Select Game Type:`, makeGameTypeKeyboard()); return; }
  if (buttonText === `${EMOJI.BACK} Back` && userManualBet[userId]) {
    delete userManualBet[userId];
    const loggedIn = !!userSessions[userId];
    await sendMessageWithRetry(ctx, `${EMOJI.BACK} Returning...`, makeMainKeyboard(loggedIn, isAdminUser));
    return;
  }

  if (userState[userId]?.state === "INPUT_MANUAL_CUSTOM_AMT") {
    const amt = parseInt(text);
    if (isNaN(amt) || amt <= 0) return await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid amount.`);
    const choice = userState[userId].choice;
    delete userState[userId];
    await sendMessageWithRetry(ctx, `${EMOJI.BALANCE} Amount: *${amt}*\n\n${EMOJI.RISK} Select Multiplier:`, makeManualMultiplierKeyboard(choice, amt));
    return;
  }

  if (userState[userId]?.state === "INPUT_MANUAL_CUSTOM_MULT") {
    const mult = parseInt(text);
    if (isNaN(mult) || mult <= 0) return await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid multiplier.`);
    const { choice, amount } = userState[userId];
    delete userState[userId];
    await sendMessageWithRetry(ctx, `${EMOJI.RISK} Multiplier: *${mult}x*\n\n${EMOJI.WARNING} Confirm:`, makeManualConfirmKeyboard(choice, amount, mult));
    return;
  }
  
  const currentState = userState[userId]?.state;
  
  if (currentState === "INPUT_VIRTUAL_BALANCE") {
    const balance = parseFloat(text);
    if (isNaN(balance) || balance <= 0) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid balance amount.`); return; }
    const settings = userSettings[userId];
    settings.virtual_mode = true;
    settings.virtual_balance = balance;
    if (!userStats[userId]) userStats[userId] = {};
    userStats[userId].virtual_balance = balance;
    userStats[userId].initial_balance = balance;
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD('Virtual Mode:')} ${balance} Ks`, makeMainKeyboard(true, isAdminUser));
    delete userState[userId];
    saveUserSettings();
    return;
  }
  
  if (!await checkUserAuthorized(ctx) && text.toLowerCase() !== "login") return;
  
  if (currentState === "INPUT_BET_SIZES") {
    const rawLines = lines.map(s => s.toUpperCase().replace(/\s+/g, '')); 
    const betSizes = [];
    for (const s of rawLines) {
      if (s === 'ALLIN') betSizes.push('ALL IN');
      else if (s.match(/^\d+$/)) betSizes.push(Number(s));
    }
    
    if (betSizes.length === 0) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} No valid numbers entered.`, makeMainKeyboard(true, isAdminUser)); return; }
    
    const settings = userSettings[userId];
    if (settings.betting_strategy === "D'Alembert") {
      if (betSizes.length > 1) {
        await sendMessageWithRetry(ctx, `${EMOJI.ERROR} D'Alembert requires only ONE Bet_Wrager.`, makeMainKeyboard(true, isAdminUser)); 
        return; 
      }
      if (betSizes[0] === 'ALL IN' || betSizes[0] === 0) {
        await sendMessageWithRetry(ctx, `${EMOJI.ERROR} D'Alembert cannot use ALL IN or 0. Please enter a valid number.`, makeMainKeyboard(true, isAdminUser)); 
        return;
      }
    }
    
    userSettings[userId].bet_sizes = betSizes;
    userSettings[userId].dalembert_units = 1;
    userSettings[userId].martin_index = 0;
    userSettings[userId].custom_index = 0;
    
    const displaySizes = betSizes.join(', ');
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD('Bet_Wrager set:')} ${displaySizes} Ks`, makeMainKeyboard(true, isAdminUser));
    delete userState[userId];
    saveUserSettings();
  } else if (currentState === "INPUT_BS_PATTERN") {
    const pattern = text.toUpperCase().trim();
    if (!pattern) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Pattern cannot be empty.`, makeMainKeyboard(true, isAdminUser)); return; }
    if (!pattern.split('').every(c => c === 'B' || c === 'S')) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Pattern can only contain 'B' and 'S'.`, makeMainKeyboard(true, isAdminUser)); return; }
    if (pattern.length < 3) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Pattern must be at least 3 characters.`, makeMainKeyboard(true, isAdminUser)); return; }
    userSettings[userId].pattern = pattern;
    userSettings[userId].pattern_index = 0;
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD('BS Pattern set:')} ${pattern}\n${EMOJI.INFO} First bet: ${pattern[0]}`, makeMainKeyboard(true, isAdminUser));
    delete userState[userId];
    saveUserSettings();
  } else if (currentState === "INPUT_PROFIT_TARGET") {
    const target = parseFloat(text);
    if (isNaN(target) || target <= 0) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid profit target.`, makeRiskManagementSubmenu()); return; }
    userSettings[userId].target_profit = target;
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD('TARGET set:')} ${target} Ks`, makeRiskManagementSubmenu());
    delete userState[userId];
    saveUserSettings();
  } else if (currentState === "INPUT_STOP_LIMIT") {
    const stopLoss = parseFloat(text);
    if (isNaN(stopLoss) || stopLoss <= 0) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Invalid stop loss.`, makeRiskManagementSubmenu()); return; }
    userSettings[userId].stop_loss = stopLoss;
    await sendMessageWithRetry(ctx, `${EMOJI.SUCCESS} ${STYLE.BOLD('STOP LOSS set:')} ${stopLoss} Ks`, makeRiskManagementSubmenu());
    delete userState[userId];
    saveUserSettings();
  } else {
    if (userSessions[userId] && text.trim() !== "") {
      if (text.length > 1 && !text.match(/^\/[a-zA-Z]/)) {
        await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Unknown command.`, makeMainKeyboard(true, isAdminUser));
      }
    }
  }
}

async function showUserStats(ctx, userId) {
  const session = userSessions[userId];
  const userInfo = userGameInfo[userId];
  if (!userInfo) { await sendMessageWithRetry(ctx, `${EMOJI.ERROR} Please login first.`, makeMainKeyboard(!!userSessions[userId], isAdmin(userId))); return; }
  
  const settings = userSettings[userId] || {};
  const betSizes = settings.bet_sizes || [];
  const strategy = settings.strategy || "TREND_FOLLOW";
  const bettingStrategy = settings.betting_strategy || "Martingale";
  const gameType = settings.game_type || "WINGO";
  const betType = settings.bet_type || "BS";
  const virtualMode = settings.virtual_mode || false;
  const profitTarget = settings.target_profit;
  const stopLoss = settings.stop_loss;
  const slLayer = settings.sl_layer;
  const layerLimit = settings.layer_limit || 1;
  const platformKey = settings.platform || "6LOTTERY";
  const platform = PLATFORMS[platformKey];
  
  let balance;
  if (virtualMode) balance = userStats[userId]?.virtual_balance || settings.virtual_balance || 0;
  else if (session) balance = await getBalance(session, parseInt(userId));
  else balance = userInfo.balance || 0;
  
  let betOrder = "N/A";
  if (strategy === "BS_ORDER") betOrder = settings.pattern || "BS-Order";
  
  let entryLayerDesc = layerLimit === 1 ? "Bet immediately" : layerLimit === 2 ? "Wait for 1 lose" : "Wait for 2 loses";
  let slStatus = userSLSkipWaitingForWin[userId] ? " (Waiting for Skip Win)" : (settings.consecutive_losses > 0 ? ` (${settings.consecutive_losses}/${slLayer || 0})` : "");
  
  const modeText = virtualMode ? `${EMOJI.VIRTUAL} Virtual Mode` : `${EMOJI.REAL} Real Mode`;
  const betTypeText = betType === "COLOR" ? `Color` : `Big/Small`;
  const safeText = (text) => text === null || text === undefined ? '' : escapeMarkdown(String(text));
  const betWrager = betSizes.map(s => s === 'ALL IN' ? 'ALL IN' : s).join(', ') || 'Not set';
  
  const infoText =
    `${EMOJI.STATS} *ACCOUNT INFO*\n${STYLE.SEPARATOR}\n\n` +
    `${EMOJI.USER} *USER DETAILS*\n` +
    `${STYLE.ITEM(`User ID: \`${safeText(userInfo.user_id?.toString() || 'N/A')}\``)}\n` +
    `${STYLE.ITEM(`Username: ${safeText(userInfo.nickname || userInfo.username || 'Unknown')}`)}\n` +
    `${STYLE.ITEM(`Platform: ${safeText(platform.name)} ${platform.color}`)}\n` +
    `${STYLE.LAST_ITEM(`Login Date: ${safeText(userInfo.login_date || 'N/A')}`)}\n${STYLE.SEPARATOR}\n\n` +
    `${EMOJI.BALANCE} *BALANCE INFORMATION*\n` +
    `${STYLE.ITEM(`Balance: ${safeText(balance !== null && balance !== undefined ? balance.toFixed(2) : 'N/A')} Ks`)}\n` +
    `${STYLE.ITEM(`Mode: ${safeText(modeText)}`)}\n${STYLE.SEPARATOR}\n\n` +
    `${EMOJI.GAME} *GAME SETTINGS*\n` +
    `${STYLE.ITEM(`Game: ${safeText(gameType)}`)}\n` +
    `${STYLE.ITEM(`Type: ${safeText(betTypeText)}`)}\n` +
    `${STYLE.ITEM(`Strategy: ${safeText(strategy)}`)}\n` +
    `${STYLE.ITEM(`Betting: ${safeText(bettingStrategy)}`)}\n` +
    `${STYLE.LAST_ITEM(`Bet_Wragers: ${safeText(betWrager)}`)}\n${STYLE.SEPARATOR}\n\n` +
    `${EMOJI.STRATEGY} *STRATEGY CONFIGURATION*\n` +
    `${STYLE.ITEM(`BS Order: ${safeText(betOrder)}`)}\n` +
    `${STYLE.ITEM(`Profit Target: ${safeText(profitTarget ? profitTarget + ' Ks' : 'Not set')}`)}\n` +
    `${STYLE.ITEM(`Stop Loss: ${safeText(stopLoss ? stopLoss + ' Ks' : 'Not set')}`)}\n` +
    `${STYLE.ITEM(`SL Layer: ${safeText(slLayer ? slLayer + ' Layer' + slStatus : 'Not set')}`)}\n` +
    `${STYLE.LAST_ITEM(`Entry Layer: ${safeText(layerLimit.toString())} - ${safeText(entryLayerDesc)}`)}\n${STYLE.SEPARATOR}\n\n` +
    `${EMOJI.START} *BOT STATUS*\n` +
    `${STYLE.LAST_ITEM(`Status: ${settings.running ? '🟢 ' : '🔴 '}${safeText(settings.running ? 'Running' : 'Stopped')}`)}\n\n${STYLE.SEPARATOR}`;
  
  await sendMessageWithRetry(ctx, infoText, makeMainKeyboard(!!userSessions[userId], isAdmin(userId)));
}

function main() {
  loadAdmins();
  loadAllowedUsers();
  loadUserSettings();
  
  const bot = new Telegraf(BOT_TOKEN);
  
  bot.start(cmdStartHandler);
  bot.command('allow', cmdAllowHandler);
  bot.command('remove', cmdRemoveHandler);
  bot.command('showid', cmdShowIdHandler);
  bot.command('users', cmdUsersHandler);
  bot.command('send', cmdSendHandler);
  bot.on('callback_query', callbackQueryHandler);
  bot.on('text', textMessageHandler);
  
  winLoseChecker(bot).catch(error => {
    logging.error(`Win/lose checker failed: ${error.message}`);
  });
  
  bot.launch().then(() => {
    logging.info('🚀 Auto Bet Bot (6LOTTERY + CKLOTTERY) started successfully');
    
    // Auto-Resume Betting Logic (Server Restart ဖြစ်ရင် ပြန်လောင်းပေးရန်)
    setTimeout(() => {
      for (const [userId, settings] of Object.entries(userSettings)) {
        if (settings.running && userSessions[userId]) {
          logging.info(`🔄 Auto-resuming betting for user ${userId}`);
          const mockCtx = {
            reply: async (text, options) => {
              try { await bot.telegram.sendMessage(userId, text, options); } catch(e) {}
            }
          };
          bettingWorker(userId, mockCtx, bot);
        }
      }
    }, 5000);

  }).catch(error => {
    logging.error(`❌ Bot failed to start: ${error.message}`);
  });

  const PORT = process.env.PORT || 3000;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('🤖 Auto Bet Bot is running!\n');
  });
  server.listen(PORT, '0.0.0.0', () => {
    logging.info(`🌐 Web server listening on port ${PORT}`);
  });

  process.on('uncaughtException', (error) => {
    logging.error(`💥 Uncaught Exception: ${error.message}`);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logging.error(`⚠️ Unhandled Rejection: ${reason}`);
  });
  
  process.once('SIGINT', () => { saveUserSettings(); bot.stop('SIGINT'); });
  process.once('SIGTERM', () => { saveUserSettings(); bot.stop('SIGTERM'); });
}

if (require.main === module) {
  main();
}
