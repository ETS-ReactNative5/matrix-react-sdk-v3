/*
Copyright 2021 Léo Mora <l.mora@outlook.fr>

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import {MatrixClientPeg} from '../MatrixClientPeg';
import SdkConfig from "../SdkConfig";
import TchapApi from './TchapApi';
import DMRoomMap from "../utils/DMRoomMap";
import {_t} from "../languageHandler";
import {capitalize, getDeepEvent, shuffle} from "./utils/TchapUtils";

/**
 * Tchap utils.
 */
export default class Tchap {
    /**
     * Return a short value for getDomain().
     * @returns {string} The shortened value of getDomain().
     */
    static getShortDomain() {
        const cli = MatrixClientPeg.get();
        const baseDomain = cli.getDomain();
        const domain = baseDomain.split('.tchap.gouv.fr')[0].split('.').reverse().filter(Boolean)[0];

        return capitalize(domain) || 'Tchap';
    }

    /**
     * Return a domain name from a room_id.
     * @param {string} id The room_id to analyse.
     * @returns {string} The extracted domain name.
     */
    static getDomainFromId(id) {
        const domain = id.split(':').reverse()[0].split('.tchap.gouv.fr')[0].split('.').filter(Boolean).reverse()[0];

        return capitalize(domain) || 'Tchap';
    }

    /**
     * Return a long domain uri from a room_id.
     * @param {string} id The room_id to analyse.
     * @returns {string} The extracted domain name.
     */
    static getLongDomainFromId(id) {
        return (id.split(':').filter(Boolean).reverse()[0]);
    }

    /**
     * Return a HS from a given email.
     * @param {string} email
     * @returns {Promise}
     */
    static getHSInfoFromEmail(email) {
        const tchapHostsList = shuffle(SdkConfig.get()['hs_url_list']);
        const hostBase = TchapApi.hostBase;
        const infoUrl = TchapApi.infoFromEmailUrl;
        return fetch(hostBase + tchapHostsList[0] + infoUrl + email).then(res => {
            return res.json();
        });
    }

    /**
     * Given an email, return the homeserver associated with this email.
     * @param {string} email The email from which we are looking for the server.
     * @returns {Promise}
     */
    static discoverPlatform(email) {
        const hostBase = TchapApi.hostBase;
        const infoUrl = TchapApi.infoFromEmailUrl;
        return new Promise((resolve, reject) => {
            const tchapHostsList = shuffle(SdkConfig.get()['hs_url_list']);
            if (tchapHostsList) {
                const promises = tchapHostsList.map(url => this._httpRequest(hostBase + url + infoUrl + email, {}));
                Promise.all(promises).then(data => {
                    let hs = null;
                    let err = null;
                    for (let i = 0; i <= data.length; i++) {
                        if (data[i] && data[i].hs && data[i].hs !== "" && data[i].hs !== null) {
                            hs = data[i].hs;
                        } else if (data[i] && (data[i].hs === "" || data[i].hs === null)) {
                            err = ("ERR_UNAUTHORIZED_EMAIL");
                        } else {
                            err = ("ERR_UNREACHABLE_HOMESERVER");
                        }
                    }
                    if (hs !== null) {
                        resolve(hostBase + hs);
                    } else {
                        reject(err);
                    }
                });
            }
        });
    }

    /**
     *
     * @returns {string}
     */
    static getRandomHSUrlFromList() {
        const hostBase = TchapApi.hostBase;
        const randomHs = shuffle(SdkConfig.get()['hs_url_list'])[0];
        return hostBase + randomHs;
    }

    /**
     *
     * @param userId
     * @returns {Promise<*>}
     */
    static isUserExpired(userId) {
        const infoUrl = TchapApi.expiredInfoUrl;
        const homeserverUrl = MatrixClientPeg.get().getHomeserverUrl();
        const accessToken = MatrixClientPeg.get().getAccessToken();
        const url = `${homeserverUrl}${infoUrl}${userId}/info`;
        const options = {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        };

        return fetch(url, options).then(res => {
            return res.json();
        }).then(data => {
            return data;
        }).then(obj => {
            return !!((obj.errcode && obj.errcode === "ORG_MATRIX_EXPIRED_ACCOUNT") ||
                (obj.expired && obj.expired === true));
        });
    }

    /**
     * If the logged-in user is from an external Homeserver,
     * return true. Otherwise return false.
     * @returns {boolean}
     */
    static isCurrentUserExtern() {
        const hsUrl = MatrixClientPeg.get().getHomeserverUrl();
        return hsUrl.includes('.e.') || hsUrl.includes('.externe.');
    }

    /**
     * Return true if the given server url is external.
     * @param {string} hs
     * @returns {boolean}
     */
    static isUserExternFromServer(hs) {
        return hs.includes('.e.') || hs.includes('.externe.');
    }

    /**
     * Return true if the given server hostname is external.
     * @param {string} hs
     * @returns {boolean}
     */
    static isUserExternFromServerHostname(hs) {
        return hs.includes('e.') || hs.includes('externe.');
    }

    /**
     * Given a user ID, return true if this user is from
     * an external Homeserver. Otherwise return false.
     * @param {string} userId The user ID to test for.
     * @returns {boolean}
     */
    static isUserExtern(userId) {
        if (userId) {
            const s = userId.split(':');
            if (s && s[1]) {
                return (
                    s[1].startsWith('e.') ||
                    s[1].startsWith('agent.externe.')
                );
            }
        }
        return false;
    }

    /**
     *
     * @param str
     * @returns {boolean}
     */
    static looksLikeMxId(str) {
        return !!(str.startsWith("@") && str.includes(":"));
    }

    /**
     *
     * @param room
     * @returns {string}
     */
    static computeLongRoomNameFromRoom(room) {
        return `${room.name} [${this.computeDomainFromRoomId(room.roomId)}]`;
    }

    /**
     *
     * @param roomId
     * @returns {string}
     */
    static computeDomainFromRoomId(roomId) {
        let domainName = roomId;
        domainName = domainName.split(":")[1];
        domainName = domainName.startsWith("agent") ? domainName.split(".")[1] : domainName.split(".")[0];
        return capitalize(domainName);
    }

    /**
     *
     * @param userId
     * @returns {*}
     */
    static computeDisplayNameFromUserId(userId) {
        let dn = "";
        let reg = new RegExp('\\d*$');
        let targetTmp = userId.split(":")[0];
        targetTmp = targetTmp.replace("@", "");
        targetTmp = targetTmp.replace(reg.exec(targetTmp), "");
        dn = targetTmp;
        if (this.isUserExtern(userId)) {
            if (targetTmp.lastIndexOf("-") !== -1) {
                dn = targetTmp.substring(0, targetTmp.lastIndexOf("-")) + "@" + targetTmp.substring(targetTmp.lastIndexOf("-") + 1);
            }
        } else {
            let userPart = targetTmp.substring(0, targetTmp.lastIndexOf("-"));
            userPart = userPart.replace(".", " ");
            dn = ((u) => {
                return u.split(" ").map(d => {
                    return capitalize(d)
                }).join(" ");
            })(userPart);
        }
        return dn;
    }

    /**
     * Lookup using the proxied API.
     * @param {string} medium
     * @param {string} address
     * @returns {object} A promise
     */
    static lookupThreePid(medium, address) {
        const homeserverUrl = MatrixClientPeg.get().getHomeserverUrl();
        const homeserverName = MatrixClientPeg.get().getIdentityServerUrl().split("https://")[1];
        const accessToken = MatrixClientPeg.get().getAccessToken();
        const url = `${homeserverUrl}${TchapApi.lookupUrl}?medium=${medium}&address=${address}&id_server=${homeserverName}`;
        const options = {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        };

        return fetch(url, options).then(res => {
            return res.json();
        }).catch(err => {
            console.log(err);
        });
    }

    /**
     * Request a new validation email for expired account.
     */
    static requestNewExpiredAccountEmail() {
        const homeserverUrl = MatrixClientPeg.get().getHomeserverUrl();
        const accessToken = MatrixClientPeg.get().getAccessToken();
        const url = `${homeserverUrl}${TchapApi.accountValidityResendEmailUrl}`;
        const options = {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        };

        fetch(url, options);
    }

    /**
     * Return true if the current user is the last administrator of the given room.
     * @param {string} room
     * @returns {boolean}
     */
    static isUserLastAdmin(room) {
        const userId = MatrixClientPeg.get().getUserId();
        const members = room.getJoinedMembers();
        let adminNumber = 0;
        let isUserAdmin = false;
        members.forEach(m => {
            if (m.powerLevelNorm >= 100) {
                if (m.userId === userId) {
                    isUserAdmin = true;
                }
                adminNumber++;
            }
        });
        return isUserAdmin && adminNumber <= 1;
    }

    /**
     * Given a room, return if this room is a "forum room" (old "public")
     * @param roomId
     * @returns {boolean}
     */
    static isRoomForum(roomId) {
        return !MatrixClientPeg.get().isRoomEncrypted(roomId) && this.getJoinRules(roomId) === "public";
    }

    /**
     * Given a roomId, return the access_rule of the room.
     * @param {string} roomId The room ID to test for.
     * @returns {string} The access_rules of the room.
     */
    static getAccessRules(roomId) {
        const stateEventType = "im.vector.room.access_rules";
        const keyName = "rule";
        const defaultValue = "restricted";
        const room = MatrixClientPeg.get().getRoom(roomId);
        const event = room.currentState.getStateEvents(stateEventType, '');

        if (!event) {
            const deepEvent = getDeepEvent(room, stateEventType, "rule");
            return deepEvent ? deepEvent : defaultValue;
        }
        const content = event.getContent();
        return keyName in content ? content[keyName] : defaultValue;
    }

    /**
     * Given a roomId, return the join_rules of the room.
     * @param {string} roomId The room ID to test for.
     * @returns {string} The join_rules of the room.
     */
    static getJoinRules(roomId) {
        const stateEventType = "m.room.join_rules";
        const keyName = "join_rule";
        const defaultValue = "public";
        const room = MatrixClientPeg.get().getRoom(roomId);
        const event = room.currentState.getStateEvents(stateEventType, '');
        if (!event) {
            return defaultValue;
        }
        const content = event.getContent();
        return keyName in content ? content[keyName] : defaultValue;
    }

    /**
     *
     * @param myUserId
     * @param userId
     * @returns {*}
     */
    static getExistingRoom(myUserId, userId) {
        const rooms = DMRoomMap.shared().getDMRoomsForUserId(userId);
        let finalRoom = {
            state: null,
            roomId: null,
            weight: 0,
        };

        for (const room of rooms) {
             const r = MatrixClientPeg.get().getRoom(room);
             if (r) {
                 const myMemberShip = r.getMyMembership();
                 const hisMembership = r.currentState.members[userId].membership;
                 if (myMemberShip === "invite" && hisMembership === "join" && finalRoom.weight < 2) {
                     finalRoom = {
                         state: "invite",
                         roomId: room,
                         weight: 2,
                     };
                 } else if (myMemberShip === "join" && hisMembership === "leave" && finalRoom.weight < 1) {
                     finalRoom = {
                         state: "leave",
                         roomId: room,
                         weight: 1,
                     };
                 }
             }
        }
        return finalRoom.roomId !== null ? finalRoom : undefined;
    }

    /**
    * Given a room, return if this room is a "notice room" (system alert).
    * @param room
    * @returns {boolean}
    */
    static isRoomNotice(room) {
        return Object.keys(room.tags).includes("m.server_notice");
    }

    /**
     *
     * @param str
     * @param short
     * @returns {*}
     */
    static transformServerErrors(str, short = false) {
        let translatedString = str;
        if (str) {
            if (str.includes("** Unable to decrypt: ")) {
                translatedString = short ? _t("Decryption fail") : _t("Decryption fail: Please open Tchap on an other connected device to allow key sharing.");
            }
        } else {
            translatedString = _t("Decryption fail");
        }
        return translatedString;
    }

    /**
     *
     * @param url
     * @returns {string|null}
     */
    static imgUrlToUri(url) {
        if (url && url.includes("/thumbnail/")) {
            const u = url.split("/thumbnail/")[1];
            return `//${u}`;
        } else if (url && url.includes("/download/")) {
            const u = url.split("/download/")[1];
            return `//${u}`;
        } else {
            return null;
        }
    }

    /**
     * A fetch with a timeout option and an always resolver.
     * @param {string} url The url to fetch.
     * @param {object} opts init object from fetch() api plus a timeout option.
     * @returns {Promise}
     * @private
     */
    static _httpRequest(url, opts) {
        const options = opts || {};
        const timeoutValue = options.timeout || 30000;
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                resolve(new Error("timeout"));
            }, timeoutValue);
            fetch(url, options).then(
              (res) => {
                  clearTimeout(timeoutId);
                  resolve(res.json());
              },
              (err) => {
                  clearTimeout(timeoutId);
                  resolve({err});
              });
        });
    }
}
