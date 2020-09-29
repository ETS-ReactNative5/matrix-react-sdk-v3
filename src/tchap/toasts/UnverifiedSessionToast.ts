/*
Copyright 2020 The Matrix.org Foundation C.I.C.

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

import { _t } from '../../languageHandler';
import { MatrixClientPeg } from '../../MatrixClientPeg';
import Modal from '../../Modal';
import DeviceListener from '../../DeviceListener';
import NewSessionReviewDialog from '../../components/views/dialogs/NewSessionReviewDialog';
import ToastStore from "../../stores/ToastStore";
import GenericToast from "../../components/views/toasts/GenericToast";
import VerificationRequestDialog from '../../components/views/dialogs/VerificationRequestDialog';

function toastKey(deviceId: string) {
    return "unverified_session_" + deviceId;
}

export const showToast = (deviceId: string) => {
    const cli = MatrixClientPeg.get();

    const onAccept = () => {
        const requestPromise = cli.requestVerification(
            cli.getUserId(),
            [cli.getStoredDevice(cli.getUserId(), deviceId).deviceId],
        );
        Modal.createTrackedDialog('New Session Verification', 'Starting dialog', VerificationRequestDialog, {
            verificationRequestPromise: requestPromise,
            member: cli.getUser(cli.getUserId()),
        });
    };

    const onReject = () => {
        DeviceListener.sharedInstance().dismissUnverifiedSessions([deviceId]);
    };

    const device = cli.getStoredDevice(cli.getUserId(), deviceId);

    ToastStore.sharedInstance().addOrReplaceToast({
        key: toastKey(deviceId),
        title: _t("Encryption key request"),
        icon: "verification_warning",
        props: {
            description: _t(
                "Your unverified device '%(name)s' is requesting encryption keys.", { name: device.getDisplayName()}),
            acceptLabel: _t("Start Verification"),
            onAccept,
            rejectLabel: _t("Ignore request"),
            onReject,
        },
        component: GenericToast,
        priority: 80,
    });
};

export const hideToast = (deviceId: string) => {
    ToastStore.sharedInstance().dismissToast(toastKey(deviceId));
};
