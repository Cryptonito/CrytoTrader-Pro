const cryptoListEl = document.getElementById('list');
const searchEl = document.getElementById('search');
const detailEl = document.getElementById('crypto-detail');
const listSection = document.getElementById('crypto-list');
const cryptoNameEl = document.getElementById('crypto-name');
const intervalButtons = [...document.querySelectorAll('#interval-selector button')];
const rsiEl = document.getElementById('rsi-value');
const supportEl = document.getElementById('support-value');
const resistanceEl = document.getElementById('resistance-value');
const priceCanvas = document.getElementById('price-chart');
const currentPriceEl = document.getElementById('current-price');
const tradeSignalEl = document.getElementById('trade-signal');
const signalInfoEl = document.getElementById('signal-info');
const ctx = priceCanvas.getContext('2d');

let currentCrypto = null;
let currentInterval = '1h';
let websocket = null;

async function fetchUSDCpairs() {
  const response = await fetch("https://api.binance.com/api/v3/exchangeInfo");
  const data = await response.json();
  return data.symbols.filter(s => s.quoteAsset === "USDC" && s.status === "TRADING")
    .map(s => ({ symbol: s.symbol, name: s.baseAsset }));
}

async function renderCryptoList(filter='') {
  const pairs = await fetchUSDCpairs();
  let filtered = pairs.filter(c =>
    c.name.toLowerCase().includes(filter.toLowerCase()) ||
    c.symbol.toLowerCase().includes(filter.toLowerCase())
  );
  cryptoListEl.innerHTML = '';
  if (filtered.length === 0) {
    cryptoListEl.innerHTML = '<li>No se encontraron pares USDC</li>';
    return;
  }
  filtered.forEach(c => {
    let li = document.createElement('li');
    li.textContent = `${c.name} (${c.symbol})`;
    li.onclick = () => showDetails(c);
    cryptoListEl.appendChild(li);
  });
}

async function showDetails(crypto) {
  if(websocket) {
    websocket.close();
    websocket=null;
  }
  currentCrypto = crypto;
  cryptoNameEl.textContent = `${crypto.name} (${crypto.symbol}) - Precio USDC`;
  listSection.classList.add('hidden');
  detailEl.classList.remove('hidden');
  currentInterval = '1h';
  updateIntervalButtons();
  await updateChartAndIndicators();
  openWebSocket(currentCrypto.symbol);
}

function updateIntervalButtons() {
  intervalButtons.forEach(btn => {
    if (btn.getAttribute('data-interval') === currentInterval) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

intervalButtons.forEach(button => {
  button.addEventListener('click', async () => {
    currentInterval = button.getAttribute('data-interval');
    updateIntervalButtons();
    await updateChartAndIndicators();
  });
});

document.getElementById('btn-back').addEventListener('click', () => {
  if(websocket) {
    websocket.close();
    websocket=null;
  }
  detailEl.classList.add('hidden');
  listSection.classList.remove('hidden');
  currentCrypto = null;
  tradeSignalEl.textContent = '';
  signalInfoEl.textContent = '';
  clearCanvas();
});

searchEl.addEventListener('input', () => {
  renderCryptoList(searchEl.value);
});

async function updateChartAndIndicators() {
  if (!currentCrypto) return;

  const url = `https://api.binance.com/api/v3/klines?symbol=${currentCrypto.symbol}&interval=${currentInterval}&limit=50`;
  const response = await fetch(url);
  const klines = await response.json();

  const closePrices = klines.map(k => parseFloat(k[4]));
  const minPrice = Math.min(...closePrices);
  const maxPrice = Math.max(...closePrices);
  const support = minPrice;
  const resistance = maxPrice;
  const currentPrice = closePrices[closePrices.length - 1];

  const rsi = calculateRSI(closePrices, 14);

  const signal = getTradeSignal(rsi);

  drawChart(closePrices, support, resistance);

  rsiEl.textContent = rsi !== null ? rsi.toFixed(1) : '--';
  supportEl.textContent = support.toFixed(4);
  resistanceEl.textContent = resistance.toFixed(4);
  currentPriceEl.textContent = currentPrice.toFixed(4);

  tradeSignalEl.textContent = signal.text;
  tradeSignalEl.className = '';
  if(signal.type === 'BUY') tradeSignalEl.classList.add('signal-buy');
  else if(signal.type === 'SELL') tradeSignalEl.classList.add('signal-sell');
  else tradeSignalEl.classList.add('signal-hold');
  signalInfoEl.textContent = signal.info || '';
}

function calculateRSI(prices, period){
  if (prices.length < period) return null;
  let gains = 0, losses = 0;
  for(let i=prices.length-period; i<prices.length-1; i++){
      const diff = prices[i+1] - prices[i];
      if(diff > 0) gains += diff;
      else losses -= diff;
  }
  if(gains === 0 && losses === 0) return 50;
  const rs = gains/losses;
  return 100 - (100/(1+rs));
}

function getTradeSignal(rsi){
  if(rsi === null) return { type:'HOLD', text:'Sin datos suficientes', info:'' };
  if(rsi < 30) return { type:'BUY', text:'Comprar', info:'RSI indica sobreventa (posible oportunidad de compra)' };
  if(rsi > 70) return { type:'SELL', text:'Vender', info:'RSI indica sobrecompra (posible oportunidad de venta)' };
  return { type:'HOLD', text:'Mantener', info:'Mercado neutral según RSI' };
}

function drawChart(prices, soporte, resistencia){
  clearCanvas();
  if(prices.length < 2) return;
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  ctx.beginPath();
  ctx.strokeStyle = 'lime';
  ctx.lineWidth = 2;
  prices.forEach((price, i) => {
    const x = (i/(prices.length-1))*priceCanvas.width;
    const y = priceCanvas.height - ((price - minPrice) / (maxPrice - minPrice))*priceCanvas.height;
    if(i === 0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  });
  ctx.stroke();

  let supY = priceCanvas.height - ((soporte - minPrice) / (maxPrice - minPrice))*priceCanvas.height;
  ctx.beginPath();
  ctx.strokeStyle = 'yellow';
  ctx.setLineDash([6,4]);
  ctx.moveTo(0,supY);
  ctx.lineTo(priceCanvas.width,supY);
  ctx.stroke();

  let resY = priceCanvas.height - ((resistencia - minPrice) / (maxPrice - minPrice))*priceCanvas.height;
  ctx.beginPath();
  ctx.strokeStyle = 'red';
  ctx.moveTo(0,resY);
  ctx.lineTo(priceCanvas.width,resY);
  ctx.stroke();

  ctx.setLineDash([]);
}

function clearCanvas(){
  ctx.clearRect(0,0,priceCanvas.width,priceCanvas.height);
}

renderCryptoList();
