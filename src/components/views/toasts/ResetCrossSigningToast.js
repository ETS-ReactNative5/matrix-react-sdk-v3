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

import React from 'react';
import { _t } from '../../../languageHandler';
import FormButton from "../elements/FormButton";
import { accessSecretStorage } from '../../../CrossSigningManager';
import ToastStore from "../../../stores/ToastStore";

export default class ResetCrossSigningToast extends React.PureComponent {

    _onResetClick = async () => {
        try {
            await accessSecretStorage(() => undefined, true);
        } catch (e) {
            console.error("Error bootstrapping secret storage", e);
        }
        ToastStore.sharedInstance().dismissToast(this.props.toastKey);
    }

    _onLaterClick = async () => {
        ToastStore.sharedInstance().dismissToast(this.props.toastKey);
    }

    render() {
        return (<div>
            <div className="mx_Toast_description">
                <p>{_t("Something went wrong earlier while upgrading your encryption.")}</p>
                <p><strong>{_t("You won't be able to cross-sign other people or your own sessions until you reset.")}</strong> {_t("Note that this will clear all the verifications you might have done so far.")}</p>
            </div>
            <div className="mx_Toast_buttons" aria-live="off">
                <FormButton label={_t("Later")} onClick={this._onLaterClick} kind="danger" />
                <FormButton label={_t("Reset")} onClick={this._onResetClick} />
            </div>
        </div>);
    }
}
