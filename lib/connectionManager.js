'use strict';

const LoginHelper = require('./loginHelper.js');
const Mutex = require('async-mutex').Mutex;
const mutex = new Mutex();

function ConnectionManager() {
    var self = this;
    self.connections = {};
    self.release = null;
}

ConnectionManager.prototype.getTokens = function (username, password) {
    var self = this;
    return mutex.acquire()
        .then(function (release) {
            self.release = release;
            if (self.connections[username] == null) {
                return createConn(username, password)
                    .then(function (tokens) {
                        self.connections[username] = new EaseeConnection(username, password, tokens);
                        return self.connections[username].tokens;
                    }).catch(reason => {
                        return Promise.reject(reason);
                    });
            } else {
                console.log(`Reusing access tokens for username '${username}'`);
                return Promise.resolve(self.connections[username].tokens);
            }
        })
        .finally(function () {
            self.release();
        });
}

function refreshToken(tokens) {
    return LoginHelper.refreshToken(tokens)
        .then(function (tokens) {
            return tokens;
        }).catch(reason => {
            return Promise.reject(reason);
        });
}

function createConn(username, password) {
    console.log(`Generating new access tokens for username '${username}'`);
    return LoginHelper.login({
        userName: username,
        password: password
    }).then(function (tokens) {
        return tokens;
    }).catch(reason => {
        return Promise.reject(reason);
    });
}

class EaseeConnection {
    constructor(username, password, tokens) {
        this._username = username;
        this._password = password;
        this._tokens = tokens;
        //Tokens are valid for 24h, refresh after 23h
        //If refresh fails, then login from start
        this._timer = setInterval(() => {
            let self = this;
            console.log(`Refreshing access tokens for username '${self.username}'`);
            refreshToken(self.tokens)
                .then(function (tokens) {
                    self._tokens = tokens;
                }).catch(reason => {
                    //console.error(reason);
                    console.error('Failed to refresh tokens, generating new using user/password');
                    createConn(self.username, self.password)
                        .then(function (tokens) {
                            self._tokens = tokens;
                        }).catch(reason => {
                            console.error(reason);
                            console.error('Failed to generate new tokens, out of luck :(');
                        });
                });
        }, 60 * 60 * 23 * 1000);
    }

    get username() {
        return this._username;
    }

    get password() {
        return this._password;
    }

    get tokens() {
        return this._tokens;
    }
}

exports = module.exports = ConnectionManager;