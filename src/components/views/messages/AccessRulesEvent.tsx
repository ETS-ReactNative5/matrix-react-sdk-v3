import React, {forwardRef} from 'react';
import {MatrixEvent} from "matrix-js-sdk/src/models/event";

import { _t } from '../../../languageHandler';
import EventTileBubble from "./EventTileBubble";

interface IProps {
    mxEvent: MatrixEvent;
}

const AccessRulesEvent = forwardRef<HTMLDivElement, IProps>(({mxEvent}, ref) => {
    if (mxEvent.getContent().rule !== "unrestricted") {
        return;
    }

    return <EventTileBubble
      className="tc_accessRulesEvent tc_accessRulesEvent_icon"
      title={_t("Room open to external users")}
      subtitle={_t("Externals are allowed to join this room")}
      ref={ref}
    />;
});

export default AccessRulesEvent;
