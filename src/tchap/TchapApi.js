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

export default {
    hostBase: "https://matrix.",
    infoFromEmailUrl: "/_matrix/identity/api/v1/info?medium=email&address=",
    publicKeyUrl: "/_matrix/media_proxy/unstable/public_key",
    scanEncryptedUrl: "/_matrix/media_proxy/unstable/scan_encrypted",
    scanUnencryptedUrl: "/_matrix/media_proxy/unstable/scan/",
    downloadUnencryptedUrl: "/_matrix/media_proxy/unstable/download/",
    downloadEncryptedUrl: "/_matrix/media_proxy/unstable/download_encrypted",
    downloadUnencryptedThumbnailUrl: "/_matrix/media_proxy/unstable/thumbnail/",
    lookupUrl: "/_matrix/client/unstable/account/3pid/lookup",
    accountValidityResendEmailUrl: "/_matrix/client/unstable/account_validity/send_mail",
    passwordRulesUrl: "/_matrix/client/r0/password_policy",
    expiredInfoUrl: "/_matrix/client/r0/user/",
};
