function report(hostname) {

}
function share(event, hostname) {
    navigator.clipboard.writeText(`${location.protocol}//${location.host}/webpage/?hostname=${hostname}`);
    event.target.textContent = "copied";
    setTimeout(() => {
        event.target.textContent = "share";
    }, 1000);
}
function like(event, hostname) {
    (new Promise(function(resolve, reject) {
        fetch(`/api/like?hostname=${hostname}`)
            .then(response => {
                console.log(response)
                if (response.status === 200) {
                    response.text()
                        .then(function(text) {
                            resolve(parseInt(text))
                        })
                }
                else reject()
            })
    }))
        .then(function(likes) { event.target.innerText = `like - ${likes}` })
}
function webpages(page=1) {
    fetch(`/api/webpages?page=${page}`)
        .then(response => {
            console.log(response)
            return response.json()
        })
        .then(response => {
            const _webpages = document.getElementsByTagName("main").item(0)
            if (_webpages === null) return
            Object.keys(response.webpages).forEach(hostname => {
                const info = response.webpages[hostname]
                const _webpage = document.createElement("section")
                const _buttons = document.createElement("aside")
                const _like = document.createElement("button")
                _like.classList.add("button", "like")
                _like.innerText = `like - ${info.likes.toString()}`
                _like.onclick = function() {
                    like(hostname)
                        .then(function(likes) {
                            _like.innerText = `like - ${likes}`
                        })
                }
                const _share = document.createElement("button")
                _share.classList.add("button", "share")
                _share.innerText = `share`
                _share.onclick = function(event) { share(event, hostname)}
                const _title = document.createElement("a")
                _title.classList.add("title")
                _title.href = `webpage?hostname=${hostname}`
                _title.innerText = hostname

                _webpage.appendChild(_title)
                _buttons.appendChild(_share)
                _buttons.appendChild(_like)
                _webpage.appendChild(_buttons)
                _webpages.appendChild(_webpage)
            });
            if (!response.complete) {
                if ((document.body.scrollHeight - window.innerHeight) === 0) {
                    webpages(page + 1)
                } else window.onscroll = function(ev) {
                    if (window.scrollY + 100 >= (document.body.scrollHeight - window.innerHeight)) {
                        window.onscroll = undefined
                        webpages(page + 1)
                    }
                };
            }
        })
}
function webpage() {
    const hostname = (new URLSearchParams(location.search)).get("hostname")
    if (hostname !== null) {
        const _webpage = document.getElementById("webpage")
        _webpage.textContent = hostname
        _webpage.href = `${location.protocol}//${hostname}`
        document.title = hostname

        fetch(`/api/webpage?hostname=${hostname}`)
            .then(response => {
                if (response.status === 200) return response.json()
                else return ""
            })
            .then(body => {
                if (body !== "") {
                    if (body.description !== null) {
                        const _description = document.getElementsByTagName("article")[0]
                        console.log(_description)
                        if (_description === null) return
                        let innerElement = null
                        body.description.split("\n").forEach(line => {
                            line = line.trim()

                            if (line.startsWith("-")) {
                                const element = document.createElement("li")
                                element.innerText = line.slice(1).trim()
                                if (innerElement === null) innerElement = document.createElement("ul")
                                if (innerElement.tagName !== "ul") _description.appendChild(innerElement)
                                innerElement.appendChild(element)
                            } else {
                                let textSize = 0
                                let textEndIndex = 0
                                for (let index = 0; index < line.length; index++) {
                                    const character = line[index]
                                    if (index < 6 && character === "#") {
                                        textSize += 1
                                        textEndIndex = index + 1
                                    } else if ((textEndIndex > index && character !== "#" && character !== " ") || (index >= 6 && character === "#")) {
                                        textSize = 0
                                        textEndIndex = 0
                                    }
                                }
                                if (innerElement !== null) _description.appendChild(innerElement)
                                const element = document.createElement(textSize === 0 ? "p" : `h${textSize}`)
                                element.innerText = line.slice(textEndIndex) + `\nweff`
                                _description.appendChild(element)
                            }
                        })
                    }
                    const _like = document.getElementById("like")
                    if (_like !== null) {
                        _like.innerText = `like - ${body.likes.toString()}`
                        _like.onclick = function(event) { like(event, hostname) }
                    }
                    const _report = document.getElementById("report")
                    if (_report !== null) {
                        _report.onclick = function(event) { report(event, hostname) }
                    }
                    document.getElementById("share").onclick = function(event) { share(event, hostname) }
                    _webpage.href += ((typeof body.path) === "undefined") ? "" : body.path
                }
            })
    }
}
if (document.body.getAttribute("webpage") !== null) webpage()
else if (document.body.getAttribute("webpages") !== null) webpages()