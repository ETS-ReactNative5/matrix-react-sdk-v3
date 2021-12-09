/*
Copyright 2015, 2016 OpenMarket Ltd
Copyright 2017, 2018, 2019 New Vector Ltd
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
import { _t } from '../../../languageHandler';
import * as sdk from '../../../index';
import Modal from "../../../Modal";
import PasswordReset from "../../../PasswordReset";
import classNames from 'classnames';
import AuthPage from "../../views/auth/AuthPage";
import CountlyAnalytics from "../../../CountlyAnalytics";
import ServerPicker from "../../views/elements/ServerPicker";
import Tchap from "../../../tchap/Tchap";
import TchapStrongPassword from "../../../tchap/TchapStrongPassword";
import TextWithTooltip from "../../views/elements/TextWithTooltip";
import PassphraseField from "../../views/auth/PassphraseField";

// Phases
// Show the forgot password inputs
const PHASE_FORGOT = 1;
// Email is in the process of being sent
const PHASE_SENDING_EMAIL = 2;
// Email has been sent
const PHASE_EMAIL_SENT = 3;
// User has clicked the link in email and completed reset
const PHASE_DONE = 4;

export default class ForgotPassword extends React.Component {
    static propTypes = {
        onLoginClick: PropTypes.func,
        onComplete: PropTypes.func.isRequired,
    };

    state = {
        phase: PHASE_FORGOT,
        email: "",
        password: "",
        password2: "",
        errorText: null,

        // We perform liveliness checks later, but for now suppress the errors.
        // We also track the server dead errors independently of the regular errors so
        // that we can render it differently, and override any other error the user may
        // be seeing.
        serverIsAlive: true,
        serverErrorIsFatal: false,
        serverDeadError: "",
    };

    constructor(props) {
        super(props);

        CountlyAnalytics.instance.track("onboarding_forgot_password_begin");
    }

    componentDidMount() {
        this.reset = null;
    }

    submitPasswordReset(email, password) {
        this.setState({
            phase: PHASE_SENDING_EMAIL,
        });
        Tchap.discoverPlatform(email).then(hs => {
            const lowercaseEmail = email.toLowerCase();
            this.reset = new PasswordReset(hs, hs);
            this.reset.resetPassword(lowercaseEmail, password).then(() => {
                this.setState({
                    phase: PHASE_EMAIL_SENT,
                });
            }, (err) => {
                this.showErrorDialog(_t('Failed to send email') + ": " + err.message);
                this.setState({
                    phase: PHASE_FORGOT,
                });
            });
        }).catch(err => {
            this.showErrorDialog(_t('Failed to send email') + ": " + err.message);
            this.setState({
                phase: PHASE_FORGOT,
            });
        })
    }

    onVerify = async ev => {
        ev.preventDefault();
        if (!this.reset) {
            console.error("onVerify called before submitPasswordReset!");
            return;
        }
        try {
            await this.reset.checkEmailLinkClicked();
            this.setState({ phase: PHASE_DONE });
        } catch (err) {
            this.showErrorDialog(err.message);
        }
    };

    onSubmitForm = async ev => {
        ev.preventDefault();

        if (!this.state.email) {
            this.showErrorDialog(_t('The email address linked to your account must be entered.'));
        } else if (!this.state.password || !this.state.password2) {
            this.showErrorDialog(_t('A new password must be entered.'));
        } else if (this.state.password !== this.state.password2) {
            this.showErrorDialog(_t('New passwords must match each other.'));
        } else {
            const isValidPassword = TchapStrongPassword.isPasswordValid(this.state.password);
            if (!isValidPassword.isValid) {
                this.showErrorDialog(_t('This password is too weak. It must include a lower-case letter, an upper-case letter, a number and a symbol and be at a minimum 8 characters in length.'));
            } else {
                const QuestionDialog = sdk.getComponent("dialogs.QuestionDialog");
                Modal.createTrackedDialog('Forgot Password Warning', '', QuestionDialog, {
                    title: _t('Warning!'),
                    description:
                        <div>
                            { _t(
                                "Changing your password will reset any end-to-end encryption keys on all of your devices, " +
                                "making encrypted chat history unreadable. Set up Key Backup or export your room keys from another " +
                                "device before resetting your password.",
                            ) }
                        </div>,
                    button: _t('Continue'),
                    onFinished: (confirmed) => {
                        if (confirmed) {
                            this.submitPasswordReset(this.state.email, this.state.password);
                        }
                    },
                });
            }
        }
    };

    onInputChanged = (stateKey, ev) => {
        this.setState({
            [stateKey]: ev.target.value,
        });
    };

    onLoginClick = ev => {
        ev.preventDefault();
        ev.stopPropagation();
        this.props.onLoginClick();
    };

    showErrorDialog(body, title) {
        const ErrorDialog = sdk.getComponent("dialogs.ErrorDialog");
        Modal.createTrackedDialog('Forgot Password Error', '', ErrorDialog, {
            title: title,
            description: body,
        });
    }

    renderForgot() {
        const Field = sdk.getComponent('elements.Field');

        let errorText = null;
        const err = this.state.errorText;
        if (err) {
            errorText = <div className="mx_Login_error">{ err }</div>;
        }

        let serverDeadSection;
        if (!this.state.serverIsAlive) {
            const classes = classNames({
                "mx_Login_error": true,
                "mx_Login_serverError": true,
                "mx_Login_serverErrorNonFatal": !this.state.serverErrorIsFatal,
            });
            serverDeadSection = (
                <div className={classes}>
                    {this.state.serverDeadError}
                </div>
            );
        }

        return <div>
            {errorText}
            {serverDeadSection}
            <form onSubmit={this.onSubmitForm}>
                <div className="mx_AuthBody_fieldRow">
                    <Field
                        name="reset_email" // define a name so browser's password autofill gets less confused
                        type="text"
                        label={_t('Email')}
                        value={this.state.email}
                        onChange={this.onInputChanged.bind(this, "email")}
                        autoFocus
                        onFocus={() => CountlyAnalytics.instance.track("onboarding_forgot_password_email_focus")}
                        onBlur={() => CountlyAnalytics.instance.track("onboarding_forgot_password_email_blur")}
                    />
                </div>
                <div className="mx_AuthBody_fieldRow">
                    <PassphraseField
                        name="reset_password"
                        minScore={0}
                        value={this.state.password}
                        onChange={this.onInputChanged.bind(this, "password")}
                        onValidate={() => {}}
                        onFocus={() => CountlyAnalytics.instance.track("onboarding_forgot_password_newPassword_focus")}
                        onBlur={() => CountlyAnalytics.instance.track("onboarding_forgot_password_newPassword_blur")}
                        autoComplete="new-password"
                    />
                    <Field
                        name="reset_password_confirm"
                        type="password"
                        label={_t('Confirm')}
                        value={this.state.password2}
                        onChange={this.onInputChanged.bind(this, "password2")}
                        onFocus={() => CountlyAnalytics.instance.track("onboarding_forgot_password_newPassword2_focus")}
                        onBlur={() => CountlyAnalytics.instance.track("onboarding_forgot_password_newPassword2_blur")}
                        autoComplete="new-password"
                    />
                    <TextWithTooltip
                      tooltip={_t('Your password must include a lower-case letter, ' +
                      'an upper-case letter, a number and a symbol and be at a ' +
                      'minimum 8 characters in length.')}
                      tooltipClass='mx_Tooltip_dark'>
                        <img className="tc_PasswordHelper" src={require('../../../../res/img/tchap/question_mark.svg')}
                          width={25} height={25}
                          alt={"Password Complexity Helper"} />
                    </TextWithTooltip>
                </div>
                <span>{_t(
                    'A verification email will be sent to your inbox to confirm ' +
                    'setting your new password.',
                )}</span>
                <input
                    className="mx_Login_submit"
                    type="submit"
                    value={_t('Send Reset Email')}
                />
            </form>
            <a className="mx_AuthBody_changeFlow" onClick={this.onLoginClick} href="#">
                {_t('Sign in instead')}
            </a>
        </div>;
    }

    renderSendingEmail() {
        const Spinner = sdk.getComponent("elements.Spinner");
        return <Spinner />;
    }

    renderEmailSent() {
        return <div>
            {_t("If a Tchap account exists, an email has been sent to the address: " +
                "%(emailAddress)s. Once you've followed the link it contains, " +
                "click below.", { emailAddress: this.state.email })}
            <br />
            <input className="mx_Login_submit" type="button" onClick={this.onVerify}
                value={_t('I have verified my email address')} />
        </div>;
    }

    renderDone() {
        return <div>
            <p>{_t("Your password has been reset.")}</p>
            <p>{_t(
                "You have been logged out of all sessions and will no longer receive " +
                "push notifications. To re-enable notifications, sign in again on each " +
                "device.",
            )}</p>
            <input className="mx_Login_submit" type="button" onClick={this.props.onComplete}
                value={_t('Return to login screen')} />
        </div>;
    }

    render() {
        const AuthHeader = sdk.getComponent("auth.AuthHeader");
        const AuthBody = sdk.getComponent("auth.AuthBody");

        let resetPasswordJsx;
        switch (this.state.phase) {
            case PHASE_FORGOT:
                resetPasswordJsx = this.renderForgot();
                break;
            case PHASE_SENDING_EMAIL:
                resetPasswordJsx = this.renderSendingEmail();
                break;
            case PHASE_EMAIL_SENT:
                resetPasswordJsx = this.renderEmailSent();
                break;
            case PHASE_DONE:
                resetPasswordJsx = this.renderDone();
                break;
        }

        return (
            <AuthPage>
                <AuthHeader />
                <AuthBody>
                    <h2> { _t('Set a new password') } </h2>
                    {resetPasswordJsx}
                </AuthBody>
            </AuthPage>
        );
    }
}
