// this function is from https://attacomsian.com/blog/javascript-generate-random-string
function randomID(length = 50) {
    // Declare all characters
    let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    // Pick characers randomly
    let str = '';
    for (let i = 0; i < length; i++) {
        str += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return str;
};
// this function is from https://www.npmjs.com/package/is-valid-hostname
function isValidHostname(value) {
    if (typeof value !== 'string') return false
    if (!value.includes(".")) return false
  
    const validHostnameChars = /^[a-zA-Z0-9-.]{1,253}\.?$/g
    if (!validHostnameChars.test(value)) {
        return false
    }
  
    if (value.endsWith('.')) {
        value = value.slice(0, value.length - 1)
    }
  
    if (value.length > 253) {
        return false
    }
  
    const labels = value.split('.')
  
    const isValid = labels.every(function (label) {
        const validLabelChars = /^([a-zA-Z0-9-]+)$/g
    
        const validLabel = (
            validLabelChars.test(label) &&
            label.length < 64 &&
            !label.startsWith('-') &&
            !label.endsWith('-')
        )
    
        return validLabel
    })
  
    return isValid
}
const DAYS_UNTIL_CALLBACK_EXPIRY = 2
const RESERVED_PATHS = ["api", "webpage", "src"]

let routes = new Map([])
function route(handler, path, method) {
    let _routes = routes.get(path) ?? []
    _routes.push((typeof method) === "undefined" ? handler : [handler, method])
    routes.set(path, _routes)
}

// token stuff
route(async function(request, url,  env) {
    let _token = request.headers.get("Authenticate")
    if (_token == null || !_token.includes(" ")) {
        const __token = url.searchParams.get("access_token")
        if (__token === null) return new Response("", {
            "headers": { "WWW-Authenticate": `Bearer` },
            "status": 401
        })
        _token = `Bearer ${__token}`
    }
    const token = _token.trim().split(" ")[1]
    
    let hostname = (url.searchParams.get("hostname") ?? "").trim()
    if (hostname === "" || !isValidHostname(hostname)) return new Response("", { "status": 400 })
    const tokens = await env.TOKENSTORE.list({ prefix: `${hostname}-` })

    let invalidToken = true
    let censoredTokens = []

    tokens.keys.forEach(key => {
        const value = key.metadata.token
        if (value === token) invalidToken = false
        censoredTokens.splice(parseInt(key.name.split("-")[1]), 0, value.replace(value.substring(4, value.length - 4), "..."))
    })
    if (invalidToken) return new Response("", {
        "headers": { "WWW-Authenticate": `Bearer realm="a token is required to list other tokens for the hostname"` },
        "status": 401
    })
    return new Response(JSON.stringify({ tokens: censoredTokens }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    })
}, "/api/tokens/")

route(async function(request, url, env) {
    const hostname = (url.searchParams.get("hostname") ?? "").trim()
    if (hostname === "" || !isValidHostname(hostname)) return new Response("", { "status": 400 })

    const test = randomID()
    const accessToken = randomID()

    let currentDate = new Date(Date.now())
    currentDate.setDate(currentDate.getDate() + DAYS_UNTIL_CALLBACK_EXPIRY)

    await env.TOKENSTORE.put(`test-${accessToken}`, `${hostname}\n${test}`, { "expiration": (currentDate.getTime()) * 1000 })
    return new Response(`access_token=${accessToken}&test=${test}`, {
        "headers": {
            "Content-Type": "application/x-www-form-urlencoded",
            "Expires": currentDate.toUTCString()
        },
        "status": 200
    })
}, "/api/token/", "GET")
route(async function(request, url, env) {
    let _accessToken = request.headers.get("Authenticate")
    if (_accessToken == null || !_accessToken.includes(" ")) {
        const __accessToken = url.searchParams.get("access_token")
        if (__accessToken === null) return new Response("", {
            "headers": { "WWW-Authenticate": `Bearer` },
            "status": 401
        })
        _accessToken = `Bearer ${__accessToken}`
    }
    const accessToken = _accessToken.split(" ")[1]
    // if there is not a paramter for the callback id than search for it in the body
    const _info = await env.TOKENSTORE.get(`test-${accessToken}`)
    if (_info === null) return new Response("", { "status": 401 })
    const info = _info.split("\n")
    const hostname = info[0]
    const test = info[1]

    return fetch(`https://dns.google/resolve?name=${hostname}&type=TXT`)
        .catch(reason => console.log(reason))
        .then(response => response.json())
        .then(async records => {
            records = records.Answer
            for (let index = 0; index < records.length; index++) {
                if (records[index].data == test) {
                    const token = randomID(100)

                    const tokens = await env.TOKENSTORE.list({
                        prefix: `${hostname}-`
                    })
                    const index = 0
                    tokens.keys.forEach(key => {
                        const someIndex = parseInt(key.name.split("-")[1])
                        if (index <= someIndex) index = someIndex
                    })
                    await env.TOKENSTORE.put(`${hostname}-${index + 1}`, "", { metadata: { "token": token } })
                    await env.TOKENSTORE.delete(`test-${accessToken}`)
                    return new Response(token, {
                        "headers": { "Content-Type": "text/plain" },
                        "status": 200
                    })
                }
            }
            return new Response("", { "status": 412 })
        })
}, "/api/token/", "POST")
route(async function(request, url, env) {
    let _token = request.headers.get("Authenticate")
    if (_token == null || !_token.includes(" ")) {
        const __token = url.searchParams.get("access_token")
        if (__token === null) return new Response("", {
            "headers": { "WWW-Authenticate": `Bearer` },
            "status": 401
        })
        _token = `Bearer ${__token}`
    }
    const token = _token.trim().split(" ")[1]
    
    const hostname = (url.searchParams.get("hostname") ?? "").trim()
    if (hostname === "" || !isValidHostname(hostname)) return new Response("", { "status": 400 })
    const tokens = await env.TOKENSTORE.list({ prefix: `${hostname}-` })

    let index = Math.round(parseInt(url.searchParams.get("index")))
    if (index < 0) index = tokens.keys.length + index
    if (index < 0 && !isNaN(index)) {
        return new Response("1", { "status": 400 })
    }

    let invalidToken = true
    let name = ""
    let indexes = []
    tokens.keys.forEach(key => {
        if ((key.metadata).token === token) {
            invalidToken = false
            if (isNaN(index)) name = key.name
        }
        indexes.push(parseInt(key.name.split("-")[1]))
    })
    if (!isNaN(index)) {
        indexes.sort(function(a, b) { return a - b })
        name = `${hostname}-${indexes[index]}`
    }
    if (invalidToken) return new Response ("", {
        "headers": { "WWW-Authenticate": `Bearer` },
        "status": 401
    })
    
    await env.TOKENSTORE.delete(name)
    return new Response("", { "status": 200 })
}, "/api/token/", "DELETE")
// webpage stuff
route(async function(request, url, env) {
    const hostname = (url.searchParams.get("hostname") ?? "").trim()
    const page = Math.round(parseInt((url.searchParams.get("page") ?? "1")))

    let cursor = ""
    let webpages = null
    for (let index = 0; index < page; index++) {
        console.log("hi")
        let info = {
            prefix: hostname,
            limit: 6
        }
        if (cursor !== "") info.cursor = cursor
        webpages = await env.PAGESTORE.list(info)
        if (!webpages.list_complete) cursor = webpages.cursor
        else break
    }
    console.log(webpages)
    const response = { }
    webpages.keys.forEach(key => {
        console.log(key.metadata)
        response[key.name] = {
            description: (typeof key.metadata.description) === "undefined" ? "" : key.metadata.description,
            likes: (typeof key.metadata.likes) === "undefined" ? 0 : key.metadata.likes,
            path: (typeof key.metadata.path) === "undefined" ? "" : key.metadata.path
        }
    })

    return new Response(JSON.stringify({
        complete: webpages.list_complete,
        webpages: response
    }), {
        "status": 200,
        "headers": { "Content-Type": "application/json" }
    })
}, "/api/webpages/")

route(async function(request, url, env) {
    const hostname = (url.searchParams.get("hostname") ?? "").trim()
    if (hostname === "" || !isValidHostname(hostname)) return new Response("", { "status": 400 })

    const webpage = await env.PAGESTORE.getWithMetadata(hostname)
    if (webpage === null) return new Response("", { "status": 404 })

    return new Response(JSON.stringify({
        description: webpage.metadata.description,
        clicks: webpage.metadata.clicks ?? 0,
        likes: webpage.metadata.likes ?? 0,
        path: webpage.metadata.path
    }), { "status": 200 })
}, "/api/webpage/", "GET")
route(async function(request, url, env) {
    let _token = request.headers.get("Authenticate")
    if (_token == null || !_token.includes(" ")) {
        const __token = url.searchParams.get("access_token")
        if (__token === null) return new Response("", {
            "headers": { "WWW-Authenticate": `Bearer` },
            "status": 401
        })
        _token = `Bearer ${__token}`
    }
    const token = _token.trim().split(" ")[1]
    
    let hostname = (url.searchParams.get("hostname") ?? "").trim()
    if (hostname === "" || !isValidHostname(hostname)) return new Response("", { "status": 400 })
    const tokens = await env.TOKENSTORE.list({ prefix: `${hostname}-` })

    let invalidToken = true
    tokens.keys.forEach(key => { if (key.metadata.token === token) invalidToken = false })
    if (invalidToken) return new Response("", {
        "headers": { "WWW-Authenticate": `Bearer realm="a token is required to list other tokens for the hostname"` },
        "status": 401
    })

    const body = await request.json()
    if ((typeof body.description) === "undefined" && (typeof body.path) === "undefined") return new Response("", { status: 400 })

    const { value, metadata } = await env.PAGESTORE.getWithMetadata(hostname)
    const webpage = {
        "description": (typeof body.description) !== "undefined" ? body.description : ((typeof metadata.description) === "undefined" ? "" : metadata.description),
        "path": (typeof body.path) !== "undefined" ? body.path : ((typeof metadata.path) === "undefined" ? "" : metadata.path)
    }
    await env.PAGESTORE.put(hostname, "", { metadata: webpage })

    return new Response(JSON.stringify(webpage), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    })
}, "/api/webpage/", "POST")
route(async function(request, url, env) {
    let _token = request.headers.get("Authenticate")
    if (_token == null || !_token.includes(" ")) {
        const __token = url.searchParams.get("access_token")
        if (__token === null) return new Response("", {
            "headers": { "WWW-Authenticate": `Bearer` },
            "status": 401
        })
        _token = `Bearer ${__token}`
    }
    const token = _token.trim().split(" ")[1]
    
    let hostname = (url.searchParams.get("hostname") ?? "").trim()
    if (hostname === "" || !isValidHostname(hostname)) return new Response("", { "status": 400 })
    const tokens = await env.TOKENSTORE.list({ prefix: `${hostname}-` })

    let invalidToken = true

    tokens.keys.forEach(key => {
        if (key.metadata.token === token) invalidToken = false
    })
    if (invalidToken) return new Response("", {
        "headers": { "WWW-Authenticate": `Bearer realm="a token is required to list other tokens for the hostname"` },
        "status": 401
    })

    await env.PAGESTORE.delete(hostname)

    return new Response(JSON.stringify("", { status: 200 }))
}, "/api/webpage/", "DELETE")
// like stuff
route(async function(request, url, env) {
    console.log("ho")
    let hostname = (url.searchParams.get("hostname") ?? "").trim()
    if (hostname === "" || !isValidHostname(hostname)) return new Response("", { "status": 400 })

    const webpage = await env.PAGESTORE.getWithMetadata(hostname)
    if (webpage === null) return new Response("", { "status": 404 })

    const likes = parseInt(webpage.metadata.likes ?? 0) + 1
    await env.PAGESTORE.put(hostname, "", {
        metadata: {
            description: webpage.metadata.description,
            clicks: webpage.metadata.clicks ?? 0,
            likes: likes,
            path: webpage.metadata.path
        }
    })

    return new Response(likes, { "status": 200, "headers": { "Content-Type": "text/plain" } }) 
}, "/api/like/")

route(async function(request, url, env) {
    let hostname = (url.searchParams.get("hostname") ?? "").trim()
    if (hostname === "" || !isValidHostname(hostname)) return new Response("", { "status": 400 })

    const webpage = await env.PAGESTORE.getWithMetadata(hostname)
    if (webpage === null) return new Response("", { "status": 404 })
    
    return new Response((webpage.metadata.likes ?? "0").toString(), { "status": 200, "headers": { "Content-Type": "text/plain" } }) 
}, "/api/likes/")

route(async function(request, url, env) {
    let hostname = (url.searchParams.get("hostname") ?? "").trim()
    if (hostname === "" || !isValidHostname(hostname)) return new Response("", { "status": 400 })

    const webpage = await env.PAGESTORE.getWithMetadata(hostname)
    if (webpage === null) return new Response("", { "status": 404 })
    
    return new Response((webpage.metadata.likes ?? "0").toString(), { "status": 200, "headers": { "Content-Type": "text/plain" } }) 
}, "/api/report/")

// make code readable after prototyping
export default {
    async fetch(request, env) {
        const url = new URL(request.url)

        let _key = ""
        Array.from(routes.keys()).forEach(key => {
            let route = url.pathname.substring(0, url.pathname.length)
            if (route.endsWith("/")) route = route.substring(0, route.length - 1)
            if (route === (key.endsWith("/") ? key.substring(0, key.length - 1) : key)) _key = key
        })
        let handlers = routes.get(_key)
        if ((typeof handlers) === "undefined") {
            const hostname = url.pathname.substring(1)
            if (isValidHostname(hostname) && !hostname.startsWith("src/")) return Response.redirect(`${url.protocol}//${url.host}/webpage/?hostname=${hostname}`)
            if (hostname.startsWith("src/")) url.pathname = url.pathname.substring(4)
            return env.ASSETS.fetch(url)
        }

        let response = env.ASSETS.fetch(url)
        for (let index = 0; index < handlers.length; index++) {
            let handler = handlers[index]
            let method = "GET"
            if (Array.isArray(handler)) {
                method = handler[1]
                handler = handler[0]
            }
            if (request.method !== method) return
            response = await handler(request, url, env)
            break
        }

        return response
    }
    // async scheduled(event, env, ctx) {
    //     ctx.waitUntil((function() {
    //         const hostnames = {}
    //         function list(cursor) {
    //             const _hostnames = env.REPORTSTORE.list(typeof cursor === "undefined" ? undefined : {cursor: cursor})
    //             _hostnames.keys.forEach(hostname => hostnames[hostname.name] = hostname.metadata.reports)
    //             if (!_hostnames.list_complete) list(_hostnames.cursor)
    //         }
    //         list()

    //         let reports = ""
    //         Object.keys(hostnames).forEach(hostname => reports += `${reports === "" ? "" : "\n"}${hostname}: ${hostnames[hostname]}`)

    //         fetch("https://api.elasticemail.com/v2/email/send", {
    //             "formData": {
    //                 "subject": `webpage reports: ${new Date(Date.now()).toDateString()}`,
    //                 "from": "reports@webpages.directory",
    //                 "fromName": "webpages.directory",
    //                 "to": "me@charr.cc",
    //                 "bodyHtml": `<h1>webpage reports: ${new Date(Date.now()).toDateString()}</h1><p>${reports}</p>`,
    //                 "isTransactional": true,
    //                 "apiKey": env.ELASTICEMAIL_APIKEY
    //             }
    //         })
    //     })())
    // }
}