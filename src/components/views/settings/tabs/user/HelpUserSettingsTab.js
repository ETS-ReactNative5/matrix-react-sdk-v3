/*
Copyright 2019 New Vector Ltd
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
import PropTypes from 'prop-types';
import {_t, getCurrentLanguage} from "../../../../../languageHandler";
import {MatrixClientPeg} from "../../../../../MatrixClientPeg";
import AccessibleButton from "../../../elements/AccessibleButton";
import SdkConfig from "../../../../../SdkConfig";
import createRoom from "../../../../../createRoom";
import Modal from "../../../../../Modal";
import * as sdk from "../../../../../";
import PlatformPeg from "../../../../../PlatformPeg";
import * as KeyboardShortcuts from "../../../../../accessibility/KeyboardShortcuts";
import UpdateCheckButton from "../../UpdateCheckButton";

export default class HelpUserSettingsTab extends React.Component {
    static propTypes = {
        closeSettingsFn: PropTypes.func.isRequired,
    };

    constructor() {
        super();

        this.state = {
            appVersion: null,
            canUpdate: false,
        };
    }

    componentDidMount(): void {
        PlatformPeg.get().getAppVersion().then((ver) => this.setState({appVersion: ver})).catch((e) => {
            console.error("Error getting vector version: ", e);
        });
        PlatformPeg.get().canSelfUpdate().then((v) => this.setState({canUpdate: v})).catch((e) => {
            console.error("Error getting self updatability: ", e);
        });
    }

    _onClearCacheAndReload = (e) => {
        if (!PlatformPeg.get()) return;

        // Dev note: please keep this log line, it's useful when troubleshooting a MatrixClient suddenly
        // stopping in the middle of the logs.
        console.log("Clear cache & reload clicked");
        MatrixClientPeg.get().stopClient();
        MatrixClientPeg.get().store.deleteAllData().then(() => {
            PlatformPeg.get().reload();
        });
    };

    _onBugReport = (e) => {
        const BugReportDialog = sdk.getComponent("dialogs.BugReportDialog");
        if (!BugReportDialog) {
            return;
        }
        Modal.createTrackedDialog('Bug Report Dialog', '', BugReportDialog, {});
    };

    _onStartBotChat = (e) => {
        this.props.closeSettingsFn();
        createRoom({
            dmUserId: SdkConfig.get().welcomeUserId,
            andView: true,
        });
    };

    _showSpoiler = (event) => {
        const target = event.target;
        target.innerHTML = target.getAttribute('data-spoiler');

        const range = document.createRange();
        range.selectNodeContents(target);

        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    };

    _renderLegal() {
        const tocLinks = SdkConfig.get().terms_and_conditions_links;
        if (!tocLinks) return null;

        const legalLinks = [];
        for (const tocEntry of SdkConfig.get().terms_and_conditions_links) {
            legalLinks.push(<div key={tocEntry.url}>
                <a href={tocEntry.url} rel="noreferrer noopener" target="_blank">{tocEntry.text}</a>
            </div>);
        }

        return (
            <div className='mx_SettingsTab_section mx_HelpUserSettingsTab_versions'>
                <span className='mx_SettingsTab_subheading'>{_t("Legal")}</span>
                <div className='mx_SettingsTab_subsectionText'>
                    {legalLinks}
                </div>
            </div>
        );
    }

    _renderCredits() {
        // Note: This is not translated because it is legal text.
        // Also, &nbsp; is ugly but necessary.
        return (
            <div className='mx_SettingsTab_section'>
                <span className='mx_SettingsTab_subheading'>{_t("Credits")}</span>
                <ul>
                    <li>
                        The <a href="https://github.com/matrix-org/twemoji-colr" rel="noreferrer noopener"
                               target="_blank"> twemoji-colr</a> font is ©&nbsp;
                        <a href="https://mozilla.org" rel="noreferrer noopener" target="_blank">Mozilla Foundation</a>{' '}
                        used under the terms of&nbsp;
                        <a href="http://www.apache.org/licenses/LICENSE-2.0" rel="noreferrer noopener" target="_blank">
                        Apache 2.0</a>.
                    </li>
                    <li>
                        The <a href="https://twemoji.twitter.com/" rel="noreferrer noopener" target="_blank">
                        Twemoji</a> emoji art is ©&nbsp;
                        <a href="https://twemoji.twitter.com/" rel="noreferrer noopener" target="_blank">Twitter, Inc and other
                        contributors</a> used under the terms of&nbsp;
                        <a href="https://creativecommons.org/licenses/by/4.0/" rel="noreferrer noopener" target="_blank">
                        CC-BY 4.0</a>.
                    </li>
                </ul>
            </div>
        );
    }

    render() {
        const brand = SdkConfig.get().brand;
        const baseUrl = SdkConfig.get().base_host_url;
        const faqLink = SdkConfig.get().generic_endpoints.faq;
        let faqText = _t('For help with using %(brand)s, click <a>here</a>.', { brand }, {
            'a': (sub) =>
                <a href={baseUrl + faqLink} rel="noreferrer nofollow noopener" target="_blank">{sub}</a>,
        });

        const appVersion = this.state.appVersion || 'unknown';

        let olmVersion = MatrixClientPeg.get().olmVersion;
        olmVersion = olmVersion ? `${olmVersion[0]}.${olmVersion[1]}.${olmVersion[2]}` : '<not-enabled>';

        let updateButton = null;
        if (this.state.canUpdate) {
            updateButton = <UpdateCheckButton />;
        }

        let bugReportingSection;
        if (SdkConfig.get().bug_report_endpoint_url) {
            bugReportingSection = (
                <div className="mx_SettingsTab_section">
                    <span className='mx_SettingsTab_subheading'>{_t('Bug reporting')}</span>
                    <div className='mx_SettingsTab_subsectionText'>
                        {_t(
                            "You have encountered an error and you want to help us ? " +
                            "Please describe the error encountered. There will be no direct answer, " +
                            "but your report will help us to improve Tchap. What have you done ? " +
                            "What was the expected behavior ? What really happened ?"
                        )}
                        <div className='mx_HelpUserSettingsTab_debugButton'>
                            <AccessibleButton onClick={this._onBugReport} kind='primary'>
                                {_t("Report an error")}
                            </AccessibleButton>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="mx_SettingsTab mx_HelpUserSettingsTab">
                <div className="mx_SettingsTab_heading">{_t("Help & About")}</div>
                { bugReportingSection }
                <div className='mx_SettingsTab_section'>
                    <span className='mx_SettingsTab_subheading'>{_t("FAQ")}</span>
                    <div className='mx_SettingsTab_subsectionText'>
                        {faqText}
                    </div>
                    <AccessibleButton kind="primary" onClick={KeyboardShortcuts.toggleDialog}>
                        { _t("Keyboard Shortcuts") }
                    </AccessibleButton>
                </div>
                <div className='mx_SettingsTab_section mx_HelpUserSettingsTab_versions'>
                    <span className='mx_SettingsTab_subheading'>{_t("Versions")}</span>
                    <div className='mx_SettingsTab_subsectionText'>
                        {_t("%(brand)s version:", { brand })} {appVersion}<br />
                        {_t("olm version:")} {olmVersion}<br />
                        {updateButton}
                    </div>
                </div>
                {this._renderLegal()}
                {this._renderCredits()}
                <div className='mx_SettingsTab_section mx_HelpUserSettingsTab_versions'>
                    <span className='mx_SettingsTab_subheading'>{_t("Advanced")}</span>
                    <div className='mx_SettingsTab_subsectionText'>
                        <div className='mx_HelpUserSettingsTab_debugButton'>
                            <AccessibleButton onClick={this._onClearCacheAndReload} kind='danger'>
                                {_t("Clear cache and reload")}
                            </AccessibleButton>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}
