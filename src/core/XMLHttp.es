/**
    XMLHttp.es -- XMLHttp class

    Copyright (c) All Rights Reserved. See details at the end of the file.
 */

module ejs {

    /**
        XMLHttp compatible method to retrieve HTTP data
        This code is prototype and is not yet supported
        @spec ejs
        @hide
        @stability prototype
     */
    class XMLHttp {

        use default namespace public

        private var hp: Http
        private var state: Number = 0
        private var responseBuf: ByteArray

        //  TODO spec UNSENT
        /** readyState values */
        static const Uninitialized = 0              

        //  TODO spec OPENED
        /** readyState values */
        static const Open = 1

        //  TODO spec HEADERS_RECEIVED
        /** readyState values */
        static const Sent = 2

        //  TODO spec LOADING
        /** readyState values */
        static const Receiving = 3

        //  TODO spec DONE
        /** readyState values */
        static const Loaded = 4

        /**
            Call back function for when the HTTP state changes.
         */
        public var onreadystatechange: Function

        function XMLHttp(http: Http? = null) {
            hp = http || (new Http)
            hp.async = true
        }

        /**
            Abort the connection
         */
        function abort(): void
            hp.close

        /**
            The underlying Http object
            @spec ejs
         */
        function get http() : Http
            hp

        /**
            The readystate value. This value can be compared with the XMLHttp constants: Uninitialized, Open, Sent,
            Receiving or Loaded Set to: Uninitialized = 0, Open = 1, Sent = 2, Receiving = 3, Loaded = 4
         */
        function get readyState() : Number
            state

        /**
            HTTP response body as a string.
         */
        function get responseText(): String
            responseBuf.toString()

        /**
            HTTP response payload as an XML document. Set to an XML object that is the root of the HTTP request 
            response data.
         */
        function get responseXML(): XML
            XML(responseBuf)

        /**
            Not implemented. Only for ActiveX on IE
            @hide
         */
        function get responseBody(): String {
            throw new Error("Unsupported API")
            return ""
        }

        /**
            The HTTP status code. Set to an integer Http status code between 100 and 600.
        */
        function get status(): Number
            hp.status

        /**
            Return the HTTP status code message
         */
        function get statusText() : String
            hp.statusMessage

        /**
            Return the response headers
            @returns a string with the headers catenated together.
         */
        function getAllResponseHeaders(): String {
            let result: String = ""
            for (key in hp.headers) {
                result = result.concat(key + ": " + hp.headers[key] + '\n')
            }
            return result
        }

        /**
            Return a response header. Not yet implemented.
            @param key The name of the response key to be returned.
            @returns the header value as a string
         */
        function getResponseHeader(key: String)
            header(key)

        /**
            Open a connection to the web server using the supplied URL and method.
            @param method HTTP method to use. Valid methods include "GET", "POST", "PUT", "DELETE", "OPTIONS" and "TRACE"
            @param uri URL to retrieve
            @param async If true, don't block after issuing the requeset. By defining an $onreadystatuschange callback 
                function, the request progress can be monitored. NOTE: async mode is not supported. All calls will block.
            @param user Optional user name if authentication is required.
            @param password Optional password if authentication is required.
         */
        function open(method: String, uri: String, async: Boolean = true, user: String? = null, 
                password: String = null): Void {
            responseBuf = new ByteArray(System.Bufsize)
            hp.async = async
            hp.method = method
            hp.uri = uri
            if (user && password) {
                hp.setCredentials(user, password)
            }
            hp.observe(["complete", "error"], function (event, ...args) {
                state = Loaded
                notify()
            })
            hp.observe("readable", function (event, ...args) {
                let count = hp.read(responseBuf, -1)
                state = Receiving
                notify()
            })
            hp.connect()
            state = Open
            notify()
            if (!async) {
                hp.finalize()
                App.waitForEvent(hp, "complete", hp.timeout)
            }
        }

        /**
            Send data with the request.
            @param content Data to send with the request.
         */
        function send(content: String? = null): Void {
            if (!hp.async) {
                throw new IOError("Can't call send in sync mode")
            }
            if (content == null) {
                hp.finalize()
            } else {
                hp.write(content)
            }
        }

        /**
            Set an HTTP header with the request
            @param key Key value for the header
            @param value Value of the header
            @example:
                setRequestHeader("Keep-Alive", "none")
         */
        function setRequestHeader(key: String, value: String): Void
            hp.addHeader(key, value, 1)

        /*
            Invoke the user's state change handler
         */
        private function notify() {
            if (onreadystatechange) {
                if (onreadystatechange.bound == global) {
                    onreadystatechange.call(this, this)
                } else {
                    onreadystatechange(this)
                }
            }
        }
    }
}


/*
    @copy   default
    
    Copyright (c) Embedthis Software LLC, 2003-2010. All Rights Reserved.
    Copyright (c) Michael O'Brien, 1993-2010. All Rights Reserved.
    
    This software is distributed under commercial and open source licenses.
    You may use the GPL open source license described below or you may acquire 
    a commercial license from Embedthis Software. You agree to be fully bound 
    by the terms of either license. Consult the LICENSE.TXT distributed with 
    this software for full details.
    
    This software is open source; you can redistribute it and/or modify it 
    under the terms of the GNU General Public License as published by the 
    Free Software Foundation; either version 2 of the License, or (at your 
    option) any later version. See the GNU General Public License for more 
    details at: http://www.embedthis.com/downloads/gplLicense.html
    
    This program is distributed WITHOUT ANY WARRANTY; without even the 
    implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. 
    
    This GPL license does NOT permit incorporating this software into 
    proprietary programs. If you are unable to comply with the GPL, you must
    acquire a commercial license to use this software. Commercial licenses 
    for this software and support services are available from Embedthis 
    Software at http://www.embedthis.com 
    
    @end
 */
