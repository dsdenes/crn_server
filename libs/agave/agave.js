/*eslint no-console: ["error", { allow: ["log"] }] */

import request from '../request';
import config  from '../../config';

let userAuth   = 'Basic ' + new Buffer(config.agave.username + ':' + config.agave.password).toString('base64'),
    clientAuth = 'Basic ' + new Buffer(config.agave.consumerKey + ':' + config.agave.consumerSecret).toString('base64');

let token = {
    access: null,
    refresh: null,
    expiresIn: 0,
    created: 0
};

/**
 * AGAVE
 *
 * A library for interactions with the
 * AGAVE API.
 */
export default {

// Client Management --------------------------------------------------------------------------

    /**
     * Create Client
     */
    createClient(callback) {
        request.post(config.agave.url + 'clients/v2', {
            headers: {
                Authorization: userAuth
            },
            body: {
                clientName: config.agave.clientName,
                description: config.agave.clientDescription
            }
        }, callback);
    },

    /**
     * List Clients
     */
    listClients(callback) {
        request.get(config.agave.url + 'clients/v2', {
            headers: {
                Authorization: userAuth
            }
        }, callback);
    },

// Authentication -----------------------------------------------------------------------------

    /**
     * Get Access Token
     */
    getAccessToken(callback) {
        request.post(config.agave.url + 'token', {
            headers: {
                authorization: clientAuth,
                'content-type': 'application/x-www-form-urlencoded'
            },
            query: {
                grant_type: 'password',
                username: config.agave.username,
                password: config.agave.password
            },
            body: {
                scope: 'PRODUCTION'
            }
        }, (err, res) => {
            if (res.body.error == 'invalid_client') {
                this.reCreateClient(callback);
            } else {
                token.access = res.body.access_token;
                token.refresh = res.body.refresh_token;
                token.created = Math.round((new Date).getTime() / 1000);
                token.expiresIn = res.body.expires_in;
                callback();
            }
        });
    },

    /**
     * Refresh Access Token
     */
    refreshAccessToken(callback) {
        request.post(config.agave.url + 'token', {
            headers: {
                authorization: clientAuth,
                'content-type': 'application/x-www-form-urlencoded'
            },
            query: {
                grant_type: 'refresh_token',
                refresh_token: token.refresh
            },
            body: {
                scope: 'PRODUCTION'
            }
        }, (err, res) => {
            if (res.body.error == 'invalid_client') {
                this.reCreateClient(callback);
            } else {
                token.access = res.body.access_token;
                token.refresh = res.body.refresh_token;
                token.created = Math.round((new Date).getTime() / 1000);
                token.expiresIn = res.body.expires_in;
                callback();
            }
        });
    },

    /**
     * Recreate Client
     */
    reCreateClient(callback) {
        console.log('Recreating AGAVE Client');
        this.createClient((err, res) => {
            if (res.body.status == 'error') {
                console.log('Error Creating AGAVE Client');
                console.log(res.body.message);
            } else {
                // set config changes and save to env variables
                config.agave.consumerKey = res.body.result.consumerKey;
                process.env.CRN_SERVER_AGAVE_CONSUMER_KEY=res.body.result.consumerKey;
                config.agave.consumerSecret = res.body.result.consumerSecret;
                process.env.CRN_SERVER_AGAVE_CONSUMER_SECRET=res.body.result.consumerSecret;
                clientAuth = 'Basic ' + new Buffer(config.agave.consumerKey + ':' + config.agave.consumerSecret).toString('base64');
                callback();
            }
        });
    },

    /**
     * Auth
     *
     * Run before any token authenticated request.
     * Ensures current token is valid and refreshs
     * if it's expired before continuing original
     * request.
     */
    auth(callback) {
        let now = Math.round((new Date).getTime() / 1000);

        if (!token.access) {
            this.getAccessToken(callback);
        } else if (now - token.created > token.expiresIn - 5) {
            this.refreshAccessToken(callback);
        } else {
            callback();
        }
    },

// helpers ------------------------------------------------------------------------------------

    /**
     * Handle Response
     *
     * Takes the error, response, callback and original
     * request for every non-auth request and attempts to
     * recreate the agave client if a request throws an auth
     * related errors.
     */
    handleResponse(err, res, callback, originalReq) {
        if (res.body && res.body.error && res.body.error == 'invalid_client') {
            this.reCreateClient(originalReq);
        } else {
            callback(err, res);
        }
    },

// Apps ---------------------------------------------------------------------------------------

    listApps(callback) {
        this.auth(() => {
            request.get(config.agave.url + 'apps/v2', {
                headers: {
                    Authorization: 'Bearer ' + token.access,
                    'Content-Type': 'application/json'
                },
                query: {
                    privateOnly: true
                }
            }, (err, res) => {
                this.handleResponse(err, res, callback, this.listApps.bind(this, callback));
            });
        });
    },

    getApp(appId, callback) {
        this.auth(() => {
            request.get(config.agave.url + 'apps/v2/' + appId, {
                headers: {
                    Authorization: 'Bearer ' + token.access,
                    'Content-Type': 'application/json'
                }
            }, (err, res) => {
                this.handleResponse(err, res, callback, this.getApp.bind(this, appId, callback));
            });
        });
    },

// Job Management -----------------------------------------------------------------------------

    createJob(job, callback) {
        this.auth(() => {
            request.post(config.agave.url + 'jobs/v2', {
                headers: {
                    Authorization: 'Bearer ' + token.access,
                    'content-type': 'application/json',
                    'cache-control': 'no-cache'
                },
                body: job
            }, (err, res) => {
                this.handleResponse(err, res, callback, this.createJob.bind(this, job, callback));
            });
        });
    },

    listJobs(callback) {
        this.auth(() => {
            request.get(config.agave.url + 'jobs/v2/', {
                headers: {
                    Authorization: 'Bearer ' + token.access,
                    'Content-Type': 'application/json'
                }
            }, (err, res) => {
                this.handleResponse(err, res, callback, this.listJobs.bind(this, callback));
            });
        });
    },

    getJob(jobId, callback) {
        this.auth(() => {
            request.get(config.agave.url + 'jobs/v2/' + jobId, {
                headers: {
                    Authorization: 'Bearer ' + token.access,
                    'Content-Type': 'application/json'
                }
            }, (err, res) => {
                this.handleResponse(err, res, callback, this.getJob.bind(this, jobId, callback));
            });
        });
    },

    getJobOutput(jobId, callback) {
        this.auth(() => {
            request.get(config.agave.url + 'jobs/v2/' + jobId + '/outputs/listings', {
                headers: {
                    Authorization: 'Bearer ' + token.access,
                    'Content-Type': 'application/json'
                }
            }, (err, res) => {
                this.handleResponse(err, res, callback, this.getJobOutput.bind(this, jobId, callback));
            });
        });
    },

    getJobResults(jobId, callback) {
        this.auth(() => {
            request.get(config.agave.url + 'jobs/v2/' + jobId + '/outputs/listings/out', {
                headers: {
                    Authorization: 'Bearer ' + token.access,
                    'Content-Type': 'application/json'
                }
            }, (err, res) => {
                this.handleResponse(err, res, callback, this.getJobResults.bind(this, jobId, callback));
            });
        });
    },

    /**
     * Get Path
     *
     * Takes any AGAVE path and callsback with the response.
     * Useful for things like file downloads where paths may
     * be known in advance and have a variety of structures.
     */
    getPath(path, callback) {
        this.auth(() => {
            request.get(config.agave.url + path, {
                headers: {
                    Authorization: 'Bearer ' + token.access,
                    'Content-Type': 'application/json'
                },
                encoding: null
            }, (err, res) => {
                callback(err, res, token.access);
            });
        });
    },

    /**
     * Get Path Proxy
     *
     * Works the same as getPath, but takes a response object
     * instead of a callback and directly pipes the AGAVE
     * response to the response object.
     */
    getPathProxy(path, res) {
        this.auth(() => {
            request.getProxy(config.agave.url + path, {
                headers: {
                    Authorization: 'Bearer ' + token.access,
                    'Content-Type': 'application/json'
                }
            }, res);
        });
    }


};