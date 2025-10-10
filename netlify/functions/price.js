const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args))

// Top 100 L1 tokens mapping to CoinGecko IDs
const COIN_MAP = {
  "BTC-USD": "bitcoin",
  "ETH-USD": "ethereum",
  "BNB-USD": "binancecoin",
  "SOL-USD": "solana",
  "ADA-USD": "cardano",
  "AVAX-USD": "avalanche-2",
  "DOT-USD": "polkadot",
  "MATIC-USD": "matic-network",
  "ATOM-USD": "cosmos",
  "NEAR-USD": "near",
  "APT-USD": "aptos",
  "SUI-USD": "sui",
  "SEI-USD": "sei-network",
  "INJ-USD": "injective-protocol",
  "TIA-USD": "celestia",
  "FTM-USD": "fantom",
  "ALGO-USD": "algorand",
  "VET-USD": "vechain",
  "ICP-USD": "internet-computer",
  "FIL-USD": "filecoin",
  "HBAR-USD": "hedera-hashgraph",
  "XTZ-USD": "tezos",
  "EOS-USD": "eos",
  "FLOW-USD": "flow",
  "EGLD-USD": "elrond-erd-2",
  "XLM-USD": "stellar",
  "THETA-USD": "theta-token",
  "KAVA-USD": "kava",
  "MINA-USD": "mina-protocol",
  "ROSE-USD": "oasis-network",
  "ONE-USD": "harmony",
  "ZIL-USD": "zilliqa",
  "WAVES-USD": "waves",
  "QTUM-USD": "qtum",
  "ICX-USD": "icon",
  "ZEN-USD": "zencash",
  "KDA-USD": "kadena",
  "CELO-USD": "celo",
  "KLAY-USD": "klay-token",
  "CFX-USD": "conflux-token",
  "IOTA-USD": "iota",
  "NEO-USD": "neo",
  "ONT-USD": "ontology",
  "STRAX-USD": "stratis",
  "LSK-USD": "lisk",
  "ARK-USD": "ark",
  "STEEM-USD": "steem",
  "NEM-USD": "nem",
  "XEM-USD": "nem",
  "DASH-USD": "dash",
  "DCR-USD": "decred",
  "ZEC-USD": "zcash",
  "XMR-USD": "monero",
  "SC-USD": "siacoin",
  "DGB-USD": "digibyte",
  "RVN-USD": "ravencoin",
  "BTG-USD": "bitcoin-gold",
  "DOGE-USD": "dogecoin",
  "LTC-USD": "litecoin",
  "BCH-USD": "bitcoin-cash",
  "ETC-USD": "ethereum-classic",
  "BSV-USD": "bitcoin-cash-sv",
  "XRP-USD": "ripple",
  "TRX-USD": "tron",
  "TON-USD": "the-open-network",
  "LINK-USD": "chainlink",
  "UNI-USD": "uniswap",
  "AAVE-USD": "aave",
  "MKR-USD": "maker",
  "SNX-USD": "havven",
  "COMP-USD": "compound-governance-token",
  "CRV-USD": "curve-dao-token",
  "SUSHI-USD": "sushi",
  "YFI-USD": "yearn-finance",
  "BAL-USD": "balancer",
  "LDO-USD": "lido-dao",
  "RPL-USD": "rocket-pool",
  "FXS-USD": "frax-share",
  "CVX-USD": "convex-finance",
  "STX-USD": "blockstack",
  "RUNE-USD": "thorchain",
  "LUNA-USD": "terra-luna-2",
  "OSMO-USD": "osmosis",
  "JUNO-USD": "juno-network",
  "SCRT-USD": "secret",
  "EVMOS-USD": "evmos",
  "KUJI-USD": "kujira",
  "AKT-USD": "akash-network",
  "BAND-USD": "band-protocol",
  "CKB-USD": "nervos-network",
  "IOTX-USD": "iotex",
  "ZRX-USD": "0x",
  "BAT-USD": "basic-attention-token",
  "ENJ-USD": "enjincoin",
  "MANA-USD": "decentraland",
  "SAND-USD": "the-sandbox",
  "AXS-USD": "axie-infinity",
  "GALA-USD": "gala",
  "IMX-USD": "immutable-x",
  "APE-USD": "apecoin",
}

// In-memory cache
let cache = {}
let cacheTime = 0
const CACHE_TTL = 30000 // 30 seconds

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

exports.handler = async (event, context) => {
  try {
    // Check cache
    const now = Date.now()
    if (cache && cacheTime && now - cacheTime < CACHE_TTL) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cache),
      }
    }

    const result = {}
    const coinIds = Object.values(COIN_MAP)
    const symbols = Object.keys(COIN_MAP)

    // Batch fetch current prices
    const batchSize = 50
    for (let i = 0; i < coinIds.length; i += batchSize) {
      const batch = coinIds.slice(i, i + batchSize)
      const ids = batch.join(",")

      try {
        const priceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_high=true&include_24hr_low=true&include_24hr_change=true`
        const priceRes = await fetch(priceUrl)

        if (!priceRes.ok) {
          console.error(`CoinGecko price API error: ${priceRes.status}`)
          continue
        }

        const priceData = await priceRes.json()

        // Process each coin in this batch
        for (let j = 0; j < batch.length; j++) {
          const coinId = batch[j]
          const symbol = symbols[i + j]

          if (!priceData[coinId]) continue

          const coinPrice = priceData[coinId]

          // Fetch historical data
          let history = []
          let historyDebug = "no history"

          try {
            const histUrl = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=30&interval=hourly`
            const histRes = await fetch(histUrl)

            if (histRes.ok) {
              const histData = await histRes.json()
              if (histData.prices && histData.prices.length > 0) {
                history = histData.prices.map((p) => p[1])
                historyDebug = "market_chart hourly ok"
              }
            }

            // Fallback to range if needed
            if (history.length === 0) {
              const to = Math.floor(Date.now() / 1000)
              const from = to - 30 * 24 * 60 * 60
              const rangeUrl = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`
              const rangeRes = await fetch(rangeUrl)

              if (rangeRes.ok) {
                const rangeData = await rangeRes.json()
                if (rangeData.prices && rangeData.prices.length > 0) {
                  history = rangeData.prices.map((p) => p[1])
                  historyDebug = "market_chart range ok"
                }
              }
            }
          } catch (err) {
            console.error(`History fetch error for ${coinId}:`, err.message)
          }

          result[symbol] = {
            coinId,
            price: coinPrice.usd || 0,
            high: coinPrice.usd_24h_high || 0,
            low: coinPrice.usd_24h_low || 0,
            change24h: coinPrice.usd_24h_change || 0,
            open: coinPrice.usd || 0,
            history,
            history_length: history.length,
            debug: historyDebug,
          }

          // Throttle to avoid rate limits
          await sleep(150)
        }
      } catch (err) {
        console.error(`Batch fetch error:`, err.message)
      }

      // Delay between batches
      await sleep(500)
    }

    // Update cache
    cache = result
    cacheTime = Date.now()

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    }
  } catch (error) {
    console.error("Price function error:", error)
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: error.message }),
    }
  }
}
