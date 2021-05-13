/*
Copyright 2019 Michael Telatynski <7t3chguy@gmail.com>
Copyright 2015, 2016, 2017, 2018, 2019, 2020 The Matrix.org Foundation C.I.C.

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
import * as Email from '../../../email';
import { _t } from '../../../languageHandler';
import SdkConfig from '../../../SdkConfig';
import { SAFE_LOCALPART_REGEX } from '../../../Registration';
import withValidation from '../elements/Validation';
import {ValidatedServerConfig} from "../../../utils/AutoDiscoveryUtils";
import PassphraseField from "./PassphraseField";
import CountlyAnalytics from "../../../CountlyAnalytics";
import Field from '../elements/Field';
import RegistrationEmailPromptDialog from '../dialogs/RegistrationEmailPromptDialog';
import TchapStrongPassword from "../../../tchap/TchapStrongPassword";
import Tchap from "../../../tchap/Tchap";
import classNames from "classnames";

enum RegistrationField {
    Email = "field_email",
    Password = "field_password",
    PasswordConfirm = "field_password_confirm",
}

const PASSWORD_MIN_SCORE = 0; // safely unguessable: moderate protection from offline slow-hash scenario.

interface IProps {
    // Values pre-filled in the input boxes when the component loads
    defaultEmail?: string;
    defaultPhoneCountry?: string;
    defaultPhoneNumber?: string;
    defaultUsername?: string;
    defaultPassword?: string;
    flows: {
        stages: string[];
    }[];
    serverConfig: ValidatedServerConfig;
    canSubmit?: boolean;

    onRegisterClick(params: {
        username: string;
        password: string;
        email?: string;
        phoneCountry?: string;
        phoneNumber?: string;
    }): Promise<void>;
    onEditServerDetailsClick?(): void;
}

interface IState {
    // Field error codes by field ID
    fieldValid: Partial<Record<RegistrationField, boolean>>;
    // The ISO2 country code selected in the phone number entry
    phoneCountry: string;
    username: string;
    email: string;
    password: string;
    passwordConfirm: string;
    passwordComplexity?: number;
    isExtern: boolean;
}

/*
 * A pure UI component which displays a registration form.
 */
export default class RegistrationForm extends React.PureComponent<IProps, IState> {
    static defaultProps = {
        onValidationChange: console.error,
        canSubmit: true,
    };

    constructor(props) {
        super(props);

        this.state = {
            fieldValid: {},
            phoneCountry: this.props.defaultPhoneCountry,
            username: this.props.defaultUsername || "",
            email: this.props.defaultEmail || "",
            password: this.props.defaultPassword || "",
            passwordConfirm: this.props.defaultPassword || "",
            passwordComplexity: null,
            isExtern: false,
        };

        CountlyAnalytics.instance.track("onboarding_registration_begin");
    }

    private onSubmit = async ev => {
        ev.preventDefault();
        ev.persist();

        if (!this.props.canSubmit) return;

        const allFieldsValid = await this.verifyFieldsBeforeSubmit();
        if (!allFieldsValid) {
            CountlyAnalytics.instance.track("onboarding_registration_submit_failed");
            return;
        }

        this.doSubmit(ev);
    };

    private doSubmit(ev) {
        const email = this.state.email.trim();

        CountlyAnalytics.instance.track("onboarding_registration_submit_ok", {
            email: !!email,
        });

        const promise = this.props.onRegisterClick({
            password: this.state.password.trim(),
            email: email,
        });

        if (promise) {
            ev.target.disabled = true;
            promise.finally(function() {
                ev.target.disabled = false;
            });
        }
    }

    private async verifyFieldsBeforeSubmit() {
        // Blur the active element if any, so we first run its blur validation,
        // which is less strict than the pass we're about to do below for all fields.
        const activeElement = document.activeElement as HTMLElement;
        if (activeElement) {
            activeElement.blur();
        }

        const fieldIDsInDisplayOrder = [
            RegistrationField.Password,
            RegistrationField.PasswordConfirm,
            RegistrationField.Email,
        ];

        // Run all fields with stricter validation that no longer allows empty
        // values for required fields.
        for (const fieldID of fieldIDsInDisplayOrder) {
            const field = this[fieldID];
            if (!field) {
                continue;
            }
            // We must wait for these validations to finish before queueing
            // up the setState below so our setState goes in the queue after
            // all the setStates from these validate calls (that's how we
            // know they've finished).
            await field.validate({ allowEmpty: false });
        }

        // Validation and state updates are async, so we need to wait for them to complete
        // first. Queue a `setState` callback and wait for it to resolve.
        await new Promise<void>(resolve => this.setState({}, resolve));

        if (this.allFieldsValid()) {
            return true;
        }

        const invalidField = this.findFirstInvalidField(fieldIDsInDisplayOrder);

        if (!invalidField) {
            return true;
        }

        // Focus the first invalid field and show feedback in the stricter mode
        // that no longer allows empty values for required fields.
        invalidField.focus();
        invalidField.validate({ allowEmpty: false, focused: true });
        return false;
    }

    /**
     * @returns {boolean} true if all fields were valid last time they were validated.
     */
    private allFieldsValid() {
        const keys = Object.keys(this.state.fieldValid);
        for (let i = 0; i < keys.length; ++i) {
            if (!this.state.fieldValid[keys[i]]) {
                return false;
            }
        }
        return true;
    }

    private findFirstInvalidField(fieldIDs: RegistrationField[]) {
        for (const fieldID of fieldIDs) {
            if (!this.state.fieldValid[fieldID] && this[fieldID]) {
                return this[fieldID];
            }
        }
        return null;
    }

    private markFieldValid(fieldID: RegistrationField, valid: boolean) {
        const { fieldValid } = this.state;
        fieldValid[fieldID] = valid;
        this.setState({
            fieldValid,
        });
    }

    private onEmailChange = ev => {
        this.setState({
            email: ev.target.value,
            isExtern: false,
        });
    };

    private onEmailValidate = async fieldState => {
        const result = await this.validateEmailRules(fieldState);
        if (result.valid) {
            Tchap.discoverPlatform(fieldState.value).then(hsUrl => {
                if (Tchap.isUserExternFromServer(hsUrl)) {
                    this.setState({isExtern: true})
                }
            });
        }
        this.markFieldValid(RegistrationField.Email, result.valid);
        return result;
    };

    private validateEmailRules = withValidation({
        description: () => _t("Use an email address to recover your account"),
        hideDescriptionIfValid: true,
        rules: [
            {
                key: "required",
                test(this: RegistrationForm, { value, allowEmpty }) {
                    return allowEmpty || !!value;
                },
                invalid: () => _t("Enter email address"),
            },
            {
                key: "email",
                test: ({ value }) => !value || Email.looksValid(value),
                invalid: () => _t("Doesn't look like a valid email address"),
            },
        ],
    });

    private onPasswordChange = ev => {
        this.setState({
            password: ev.target.value,
        });
    };

    private onPasswordValidate = result => {
        this.markFieldValid(RegistrationField.Password, result.valid);
    };

/*    validatePasswordRules = withValidation({
        description: () => _t("Your password must include a lower-case letter, an upper-case letter, a number and a symbol and be at a minimum 8 characters in length."),
        rules: [
            {
                key: "required",
                test: ({ value, allowEmpty }) => allowEmpty || !!value,
                invalid: () => _t("Enter password"),
            },
            {
                key: "match",
                test({ value }) {
                    return !value || Tchap.discoverPlatform(this.state.email).then(hsUrl => {
                        return TchapStrongPassword.validatePassword(hsUrl, value);
                    });
                },
                invalid: () => _t("Password too weak !"),
            },
        ],
    });*/

    private onPasswordConfirmChange = ev => {
        this.setState({
            passwordConfirm: ev.target.value,
        });
    };

    private onPasswordConfirmValidate = async fieldState => {
        const result = await this.validatePasswordConfirmRules(fieldState);
        this.markFieldValid(RegistrationField.PasswordConfirm, result.valid);
        return result;
    };

    private validatePasswordConfirmRules = withValidation({
        rules: [
            {
                key: "required",
                test: ({ value, allowEmpty }) => allowEmpty || !!value,
                invalid: () => _t("Confirm password"),
            },
            {
                key: "match",
                test(this: RegistrationForm, { value }) {
                    return !value || value === this.state.password;
                },
                invalid: () => _t("Passwords don't match"),
            },
         ],
    });

    private renderEmail() {
        return <Field
            ref={field => this[RegistrationField.Email] = field}
            type="text"
            label={_t("Email")}
            value={this.state.email}
            onChange={this.onEmailChange}
            onValidate={this.onEmailValidate}
            onFocus={() => CountlyAnalytics.instance.track("onboarding_registration_email_focus")}
            onBlur={() => CountlyAnalytics.instance.track("onboarding_registration_email_blur")}
        />;
    }

    private renderPassword() {
        return <PassphraseField
            id="mx_RegistrationForm_password"
            fieldRef={field => this[RegistrationField.Password] = field}
            minScore={PASSWORD_MIN_SCORE}
            value={this.state.password}
            onChange={this.onPasswordChange}
            onValidate={this.onPasswordValidate}
            onFocus={() => CountlyAnalytics.instance.track("onboarding_registration_password_focus")}
            onBlur={() => CountlyAnalytics.instance.track("onboarding_registration_password_blur")}
        />;
    }

    renderPasswordConfirm() {
        return <Field
            id="mx_RegistrationForm_passwordConfirm"
            ref={field => this[RegistrationField.PasswordConfirm] = field}
            type="password"
            autoComplete="new-password"
            label={_t("Confirm password")}
            value={this.state.passwordConfirm}
            onChange={this.onPasswordConfirmChange}
            onValidate={this.onPasswordConfirmValidate}
            onFocus={() => CountlyAnalytics.instance.track("onboarding_registration_passwordConfirm_focus")}
            onBlur={() => CountlyAnalytics.instance.track("onboarding_registration_passwordConfirm_blur")}
        />;
    }

    renderExternalWarning() {
        if (this.state.isExtern) {
            return <div className="tc_RegistrationForm_extern_warning">
                { _t("<b>Information</b>: The domain of your email address is not declared in Tchap. " +
                    "If you have received an invitation, you will be able to create a \"guest\" account, " +
                    "allowing only to participate in private exchanges to which you are invited.",
                    {},
                    { b: (sub) => <b> { sub } </b> },) }
            </div>;
        }
        return;
    }

    render() {
        const registerButton = (
            <input className="mx_Login_submit" type="submit" value={_t("Register")} disabled={!this.props.canSubmit} />
        );

        return (
            <div>
                <form onSubmit={this.onSubmit}>
                    <div className="mx_AuthBody_fieldRow">
                        {this.renderEmail()}
                    </div>
                    {this.renderExternalWarning()}
                    <div className="mx_AuthBody_fieldRow">
                        {this.renderPassword()}
                        {this.renderPasswordConfirm()}
                    </div>
                    { registerButton }
                </form>
            </div>
        );
    }
}
