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

import {MatrixClientPeg} from "../../MatrixClientPeg";
import {decryptFile} from "../../utils/DecryptFile";
import TchapApi from '../TchapApi';

export default class ContentScanner {

    /**
     * Generating a generic error.
     * @param {boolean} state The state of the file (clean or not).
     * @param {string} message The error message.
     * @returns {{clean: *, error: *}}
     */
    static generateError(state, message) {
        return {
            clean: state,
            error: message,
        };
    }

    /**
     * Scan a Matrix Event content.
     * If the content is a file or an encrypted file, a promise containing the scan result is returned.
     * Thumbnails for image files are not processed because a scan is ran every time a download is called.
     * @param {object} content A Mtrix Event content.
     * @returns {Promise<*>|object}
     */
    static async scanContent(content) {
        const baseUrl = MatrixClientPeg.get()['baseUrl'];

        if (content.file !== undefined) {
            // Getting the public key if the server answer
            let publicKey;
            try {
                const publicKeyData = await fetch(baseUrl + TchapApi.publicKeyUrl);
                const publicKeyObject = await publicKeyData.json();
                publicKey = publicKeyObject.public_key;
            } catch (err) {
                console.warn(`Unable to retrieve the publicKey : ${err}`);
            }

            let body;
            if (publicKey) {
                // Setting up the encryption
                const encryption = new global.Olm.PkEncryption();
                encryption.set_recipient_key(publicKey);
                body = {encrypted_body: encryption.encrypt(JSON.stringify({file: content.file}))};
            } else {
                body = {file: content.file};
            }

            return Promise.resolve(fetch(baseUrl + TchapApi.scanEncryptedUrl, {
                headers: {
                    'Content-Type': 'application/json',
                },
                method: "POST",
                body: JSON.stringify(body),
            })
                .then(res => {
                    return res.json();
                })
                .then(data => {
                    return data;
                }).catch(err => {
                    console.error(err);
                    throw this.generateError(false, 'Error: Unable to join the MCS server');
                }));
        } else if (content.url !== undefined) {
            const fileUrl = content.url.split('//')[1];

            return Promise.resolve(fetch(`${baseUrl + TchapApi.scanUnencryptedUrl}${fileUrl}`)
                .then(res => {
                    return res.json();
                })
                .then(data => {
                    return data;
                }).catch(err => {
                    console.error(err);
                    throw this.generateError(false, "Error: Cannot fetch the file");
                }));
        } else {
            throw this.generateError(false, 'Error: This is not a matrix content');
        }
    }

    /**
     * Returns an url for an unencrypted content.
     * @param {object} content A Mtrix Event content.
     * @param {boolean} isThumb If the requested data will be a thumbnail.
     * @returns {string|object} A string or an error object.
     */
    static getUnencryptedContentUrl(content, isThumb = false) {
        const baseUrl = MatrixClientPeg.get()['baseUrl'];
        let url;

        if (content.url !== undefined) {
            if (isThumb) {
                if (content.info && content.info.thumbnail_url) {
                    const fileUrl = content.info.thumbnail_url.split('//')[1];
                    url = `${baseUrl + TchapApi.downloadUnencryptedUrl}${fileUrl}`;
                } else {
                    const fileUrl = content.url.split('//')[1];
                    url = `${baseUrl + TchapApi.downloadUnencryptedThumbnailUrl}${fileUrl}`;
                }
            } else {
                const fileUrl = content.url.split('//')[1];
                url = `${baseUrl + TchapApi.downloadUnencryptedUrl}${fileUrl}`;
            }
            return url;
        } else {
            throw this.generateError(false, 'Error: This is not a matrix content');
        }
    }

    /**
     * Download an encrypted content.
     * @param {object} content A Mtrix Event content.
     * @param {boolean} isThumb If the requested data will be a thumbnail.
     * @returns {Promise<*>|blob} A Promise or an error object.
     */
    static async downloadEncryptedContent(content, isThumb = false) {
        let file;

        if (isThumb && content.info.thumbnail_file !== undefined) {
            file = content.info.thumbnail_file;
        } else if (content.file !== undefined) {
            file = content.file;
        } else {
            throw this.generateError(false, 'Error: This is not a matrix content');
        }

        if (file) {
            const blob = await decryptFile(file);
            if (blob) {
                return blob;
            } else {
                return new Blob([], {type: 'application/octet-stream'});
            }
        } else {
            throw this.generateError(false, 'Error: This is not a matrix content');
        }
    }
}
