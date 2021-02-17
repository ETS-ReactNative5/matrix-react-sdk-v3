/*
Copyright 2019 Vector Creations Ltd

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
import PropTypes from 'prop-types';
import * as sdk from '../../../index';
import { _t } from '../../../languageHandler';
import E2EIcon from "../rooms/E2EIcon";

export default class VerificationComplete extends React.Component {
    static propTypes = {
        onDone: PropTypes.func.isRequired,
    }

    render() {
        const AccessibleButton = sdk.getComponent('elements.AccessibleButton');
        return (
            <div className="mx_UserInfo_container mx_VerificationPanel_verified_section">
                <h3>{_t("Verified")}</h3>
                <p>{_t("You've successfully verified your device!")}</p>
                <E2EIcon isUser={true} status="verified" size={128} hideTooltip={true} />
                <AccessibleButton kind="primary" className="mx_UserInfo_wideButton" onClick={this.props.onDone}>
                    {_t("Got it")}
                </AccessibleButton>
            </div>
        );
    }
}
