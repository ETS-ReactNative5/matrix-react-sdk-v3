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

import React, {PureComponent, RefCallback, RefObject} from "react";
import classNames from "classnames";
import zxcvbn from "zxcvbn";
import withValidation, {IFieldState, IValidationResult} from "../elements/Validation";
import {_t, _td} from "../../../languageHandler";
import Field, {IInputProps} from "../elements/Field";
import TchapStrongPassword from "../../../tchap/TchapStrongPassword";

interface IProps extends Omit<IInputProps, "onValidate"> {
    autoFocus?: boolean;
    id?: string;
    className?: string;
    minScore: 0 | 1 | 2 | 3 | 4;
    value: string;
    fieldRef?: RefCallback<Field> | RefObject<Field>;

    label?: string;
    labelEnterPassword?: string;
    labelStrongPassword?: string;
    labelAllowedButUnsafe?: string;

    onChange(ev: React.FormEvent<HTMLElement>);
    onValidate(result: IValidationResult);
}

class PassphraseField extends PureComponent<IProps> {
    static defaultProps = {
        label: _td("Password"),
        labelEnterPassword: _td("Enter password"),
        labelStrongPassword: _td("Nice, strong password!"),
        labelAllowedButUnsafe: _td("Password is allowed, but unsafe"),
    };

    static errorArray = [];

    public readonly validate = withValidation<this, zxcvbn.ZXCVBNResult>({
        description: function(complexity) {
            const score = 4 - PassphraseField.errorArray.length;
            return <progress className="mx_PassphraseField_progress" max={4} value={score} />;
        },
        deriveData: async ({ value }) => {
            if (!value) return null;
            const { scorePassword } = await import('../../../utils/PasswordScorer');
            return scorePassword(value);
        },
        rules: [
            {
                key: "required",
                test: ({ value, allowEmpty }) => allowEmpty || !!value,
                invalid: () => _t(this.props.labelEnterPassword),
            },
            {
                key: "match",
                test({ value }) {
                    if (!value) {
                        return false;
                    }
                    const passwordValid = TchapStrongPassword.isPasswordValid(value);
                    PassphraseField.errorArray = passwordValid.errorList;
                    return passwordValid.isValid;
                },
                invalid: (data) => {
                    return this.buildErrors();
                },
                valid: () => {
                    return _t(this.props.labelStrongPassword);
                },
            },
        ],
    });

    onValidate = async (fieldState: IFieldState) => {
        const result = await this.validate(fieldState);
        this.props.onValidate(result);
        return result;
    };

    buildErrors() {
        const errors = PassphraseField.errorArray;
        let errorText = [];
        errorText.push(_t("Password too weak !"))
        errorText.push(<br />)
        for (let i = 0; i < errors.length; i++) {
            errorText.push(_t(errors[i]));
            i !== errors.length ? errorText.push(<br />) : null;
        }
        return errorText;
    };

    render() {
        return <Field
            id={this.props.id}
            autoFocus={this.props.autoFocus}
            className={classNames("mx_PassphraseField", this.props.className)}
            ref={this.props.fieldRef}
            type="password"
            autoComplete="new-password"
            label={_t(this.props.label)}
            value={this.props.value}
            onChange={this.props.onChange}
            onValidate={this.onValidate}
        />;
    }
}

export default PassphraseField;
