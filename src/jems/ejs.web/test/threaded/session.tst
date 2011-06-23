/*
    session.tst -- Test sessions
 */

const HTTP = ":" + (App.config.test.http_port || "6700")

var http: Http = new Http

//  Create a session cookie
http.get(HTTP + "/session.ejs")
assert(http.status == 200)
let cookie = http.sessionCookie
assert(http.response.trim() == "")
http.close()


//  Issue a request with the cookie to pick up the value set in session.ejs
http.setCookie(cookie)
http.get(HTTP + "/session.ejs")
assert(http.response.trim() == "77")