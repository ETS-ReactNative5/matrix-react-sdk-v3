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

const MIN_PASSWORD_LENGTH = 8;

interface IPasswordError {
    isValid: boolean;
    errorList: string[];
}

interface IRule {
    isRuleValid: boolean;
    errorText: string;
}

enum CheckClass {
    _requireMinLength,
    _requireLowercase,
    _requireUppercase,
    _requireDigit,
    _requireSymbol,
}

/**
 * Strong Password utils.
 */
export default class TchapStrongPassword {

    static isPasswordValid(passwd: string): IPasswordError {
        const errorRule: IPasswordError = {
            isValid: true,
            errorList: [],
        }

        for (const checkFunc in CheckClass) {
            if (!isNaN(Number(checkFunc))) continue;
            const tmpErrorRule: IRule = this[checkFunc](passwd);
            if (!tmpErrorRule.isRuleValid) {
                errorRule.isValid = false;
                errorRule.errorList.push(tmpErrorRule.errorText);
            }
        }
        return errorRule;
    }

    static _requireMinLength(pwd: string): IRule {
        return {
            isRuleValid: pwd.length >= MIN_PASSWORD_LENGTH,
            errorText: "At least 8 characters are required",
        };
    }

    static _requireLowercase(pwd: string): IRule {
        return {
            isRuleValid: (/[a-z]/.test(pwd)),
            errorText: "A lowercase letter is required",
        };
    }

    static _requireUppercase(pwd: string): IRule {
        return {
            isRuleValid: (/[A-Z]/.test(pwd)),
            errorText: "An uppercase letter is required",
        };
    }

    static _requireDigit(pwd: string): IRule {
        return {
            isRuleValid: (/[0-9]/.test(pwd)),
            errorText: "A digit is required",
        };
    }

    static _requireSymbol(pwd: string): IRule {
        return {
            isRuleValid: (/[^a-zA-Z0-9]/.test(pwd)),
            errorText: "A symbol is required",
        };
    }
}
