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

import * as React from "react";

import AutoHideScrollbar from './AutoHideScrollbar';
import { getHomePageUrl } from "../../utils/pages";
import { _t } from "../../languageHandler";
import SdkConfig from "../../SdkConfig";
import * as sdk from "../../index";
import dis from "../../dispatcher/dispatcher";
import { Action } from "../../dispatcher/actions";
import Tchap from "../../tchap/Tchap";

const onClickSendDm = () => dis.dispatch({action: 'view_create_chat'});
const onClickExplore = () => dis.fire(Action.ViewRoomDirectory);
const onClickNewRoom = () => dis.dispatch({action: 'view_create_room'});

const HomePage = () => {
    const config = SdkConfig.get();
    const pageUrl = getHomePageUrl(config);
    const AccessibleButton = sdk.getComponent("elements.AccessibleButton");

    if (pageUrl) {
        const EmbeddedPage = sdk.getComponent('structures.EmbeddedPage');
        return <EmbeddedPage className="mx_HomePage" url={pageUrl} scrollbar={true} />;
    }

    let logoUrl = "themes/tchap/img/logos/tchap-logo.svg";

    let defaultButtons = null;
    if (!Tchap.isCurrentUserExtern()) {
        defaultButtons  = (
            <div className="mx_HomePage_default_buttons">
                <AccessibleButton onClick={onClickSendDm} className="mx_HomePage_button_sendDm">
                    { _t("Send a Direct Message") }
                </AccessibleButton>
                <AccessibleButton onClick={onClickExplore} className="mx_HomePage_button_explore">
                    { _t("Explore Forums") }
                </AccessibleButton>
                <AccessibleButton onClick={onClickNewRoom} className="mx_HomePage_button_createGroup">
                    { _t("Create a Group Chat") }
                </AccessibleButton>
            </div>
        );
    }

    return <AutoHideScrollbar className="mx_HomePage mx_HomePage_default">
        <div className="mx_HomePage_default_wrapper">
            <img src={logoUrl} alt={config.brand || "Element"} />
            <h1>{ _t("Welcome to %(appName)s", { appName: config.brand || "Element" }) }</h1>
            <h4>{ _t("State instant messaging") }</h4>
            { defaultButtons }
        </div>
    </AutoHideScrollbar>;
};

export default HomePage;
