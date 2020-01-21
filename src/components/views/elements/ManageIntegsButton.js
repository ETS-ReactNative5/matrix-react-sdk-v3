/*
Copyright 2017 New Vector Ltd
Copyright 2019 The Matrix.org Foundation C.I.C.

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
import {IntegrationManagers} from "../../../integrations/IntegrationManagers";
import SettingsStore from "../../../settings/SettingsStore";
import {replaceableComponent} from "../../../utils/replaceableComponent";

@replaceableComponent("views.elements.ManageIntegsButton")
export default class ManageIntegsButton extends React.Component {
    constructor(props) {
        super(props);
    }

    onManageIntegrations = (ev) => {
        ev.preventDefault();

        const managers = IntegrationManagers.sharedInstance();
        if (!managers.hasManager()) {
            managers.openNoManagerDialog();
        } else {
            if (SettingsStore.isFeatureEnabled("feature_many_integration_managers")) {
                managers.openAll(this.props.room);
            } else {
                managers.getPrimaryManager().open(this.props.room);
            }
        }
    };

    render() {
        let integrationsButton = <div />;
        if (IntegrationManagers.sharedInstance().hasManager()) {
            const AccessibleButton = sdk.getComponent("elements.AccessibleButton");
            integrationsButton = (
                <AccessibleButton
                    className='mx_RoomHeader_button mx_RoomHeader_manageIntegsButton'
                    title={_t("Manage Integrations")}
                    onClick={this.onManageIntegrations}
                />
            );
        }

        return integrationsButton;
    }
}

ManageIntegsButton.propTypes = {
    room: PropTypes.object.isRequired,
};
