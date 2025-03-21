/*
Copyright 2015, 2016 OpenMarket Ltd
Copyright 2019 Michael Telatynski <7t3chguy@gmail.com>
Copyright 2019, 2020 The Matrix.org Foundation C.I.C.

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
import {MatrixClientPeg} from "../../MatrixClientPeg";
import * as sdk from "../../index";
import dis from "../../dispatcher/dispatcher";
import Modal from "../../Modal";
import { linkifyAndSanitizeHtml } from '../../HtmlUtils';
import PropTypes from 'prop-types';
import { _t } from '../../languageHandler';
import SdkConfig from '../../SdkConfig';
import { instanceForInstanceId, protocolNameForInstanceId } from '../../utils/DirectoryUtils';
import Analytics from '../../Analytics';
import {getHttpUriForMxc} from "matrix-js-sdk/src/content-repo";
import {ALL_ROOMS} from "../views/directory/NetworkDropdown";
import SettingsStore from "../../settings/SettingsStore";
import GroupFilterOrderStore from "../../stores/GroupFilterOrderStore";
import GroupStore from "../../stores/GroupStore";
import FlairStore from "../../stores/FlairStore";
import CountlyAnalytics from "../../CountlyAnalytics";
import Tchap from "../../tchap/Tchap";

const MAX_NAME_LENGTH = 80;
const MAX_TOPIC_LENGTH = 800;

function track(action) {
    Analytics.trackEvent('RoomDirectory', action);
}

export default class RoomDirectory extends React.Component {
    static propTypes = {
        initialText: PropTypes.string,
        onFinished: PropTypes.func.isRequired,
    };

    constructor(props) {
        super(props);

        CountlyAnalytics.instance.trackRoomDirectoryBegin();
        this.startTime = CountlyAnalytics.getTimestamp();

        const selectedCommunityId = GroupFilterOrderStore.getSelectedTags()[0];
        const homeserverList = SdkConfig.get()['hs_url_list'];
        this.state = {
            publicRooms: [],
            loading: true,
            protocolsLoading: true,
            error: null,
            instanceId: undefined,
            roomServer: undefined,
            filterString: this.props.initialText || "",
            selectedCommunityId: SettingsStore.getValue("feature_communities_v2_prototypes")
                ? selectedCommunityId
                : null,
            communityName: null,
            serverList: homeserverList || [],
        };

        this._unmounted = false;
        this.nextBatch = null;
        this.filterTimeout = null;
        this.scrollPanel = null;
        this.protocols = null;

        this.state.protocolsLoading = true;
        if (!MatrixClientPeg.get()) {
            // We may not have a client yet when invoked from welcome page
            this.state.protocolsLoading = false;
            return;
        }

        if (!this.state.selectedCommunityId) {
            MatrixClientPeg.get().getThirdpartyProtocols().then((response) => {
                this.protocols = response;
                this.setState({protocolsLoading: false});
            }, (err) => {
                console.warn(`error loading third party protocols: ${err}`);
                this.setState({protocolsLoading: false});
                if (MatrixClientPeg.get().isGuest()) {
                    // Guests currently aren't allowed to use this API, so
                    // ignore this as otherwise this error is literally the
                    // thing you see when loading the client!
                    return;
                }
                track('Failed to get protocol list from homeserver');
                const brand = SdkConfig.get().brand;
                this.setState({
                    error: _t(
                        '%(brand)s failed to get the protocol list from the homeserver. ' +
                        'The homeserver may be too old to support third party networks.',
                        {brand},
                    ),
                });
            });
        } else {
            // We don't use the protocols in the communities v2 prototype experience
            this.state.protocolsLoading = false;

            // Grab the profile info async
            FlairStore.getGroupProfileCached(MatrixClientPeg.get(), this.state.selectedCommunityId).then(profile => {
                this.setState({communityName: profile.name});
            });
        }
    }

    componentDidMount() {
        this.refreshRoomList();
    }

    componentWillUnmount() {
        if (this.filterTimeout) {
            clearTimeout(this.filterTimeout);
        }
        this._unmounted = true;
    }

    refreshRoomList = () => {
        if (this.state.selectedCommunityId) {
            this.setState({
                publicRooms: GroupStore.getGroupRooms(this.state.selectedCommunityId).map(r => {
                    return {
                        // Translate all the group properties to the directory format
                        room_id: r.roomId,
                        name: r.name,
                        topic: r.topic,
                        canonical_alias: r.canonicalAlias,
                        num_joined_members: r.numJoinedMembers,
                        avatarUrl: r.avatarUrl,
                        world_readable: r.worldReadable,
                        guest_can_join: r.guestsCanJoin,
                    };
                }).filter(r => {
                    const filterString = this.state.filterString;
                    if (filterString) {
                        const containedIn = (s: string) => (s || "").toLowerCase().includes(filterString.toLowerCase());
                        return containedIn(r.name) || containedIn(r.topic) || containedIn(r.canonical_alias);
                    }
                    return true;
                }),
                loading: false,
            });
            return;
        }

        this.nextBatch = null;
        this.setState({
            publicRooms: [],
            loading: true,
        });
        this._populateRoomList();
    };

    _populateRoomList() {
        const homeserverList = this.state.serverList;
        for (let i = 0; i < homeserverList.length; i++) {
            this.getMoreRooms(homeserverList[i]);
        }
    }

    getMoreRooms(homeServer) {
        if (!MatrixClientPeg.get()) return Promise.resolve();

        this.setState({
            loading: true,
        });

        const my_filter_string = this.state.filterString;
        const my_server = homeServer;
        // remember the next batch token when we sent the request
        // too. If it's changed, appending to the list will corrupt it.
        const opts = {};
        if (my_server != MatrixClientPeg.getHomeserverName()) {
            opts.server = my_server;
        }
        if (this.state.instanceId === ALL_ROOMS) {
            opts.include_all_networks = true;
        } else if (this.state.instanceId) {
            opts.third_party_instance_id = this.state.instanceId;
        }
        if (my_filter_string) opts.filter = { generic_search_term: my_filter_string };
        return MatrixClientPeg.get().publicRooms(opts).then((data) => {
            if (my_filter_string != this.state.filterString) {
                // if the filter or server has changed since this request was sent,
                // throw away the result (don't even clear the busy flag
                // since we must still have a request in flight)
                return;
            }

            if (this._unmounted) {
                // if we've been unmounted, we don't care either.
                return;
            }

            if (this.state.filterString) {
                const count = data.total_room_count_estimate || data.chunk.length;
                CountlyAnalytics.instance.trackRoomDirectorySearch(count, this.state.filterString);
            }

            this.nextBatch = data.next_batch;
            this.setState((s) => {
                s.publicRooms.push(...(data.chunk || []));
                s.loading = false;
                return s;
            });
            return Boolean(data.next_batch);
        }, (err) => {
            if (my_filter_string != this.state.filterString) {
                // as above: we don't care about errors for old
                // requests either
                return;
            }

            if (this._unmounted) {
                // if we've been unmounted, we don't care either.
                return;
            }

            if (err && (
                err.errcode === "M_FORBIDDEN" ||
                err.errcode === "M_UNKNOWN" ||
                err.errcode === "M_UNAUTHORIZED")
            ) {
                // We don't care about federation denied error.
                // Just go to the next server.
                return;
            }

            console.error("Failed to get publicRooms: %s", JSON.stringify(err));
            track('Failed to get public room list');
            const brand = SdkConfig.get().brand;
            this.setState({
                loading: false,
                error: (
                    _t('%(brand)s failed to get the public room list.', { brand }) +
                    (err && err.message) ? err.message : _t('The homeserver may be unavailable or overloaded.')
                ),
            });
        });
    }

    /**
     * A limited interface for removing rooms from the directory.
     * Will set the room to not be publicly visible and delete the
     * default alias. In the long term, it would be better to allow
     * HS admins to do this through the RoomSettings interface, but
     * this needs SPEC-417.
     */
    removeFromDirectory(room) {
        const alias = get_display_alias_for_room(room);
        const name = room.name || alias || _t('Unnamed room');

        const QuestionDialog = sdk.getComponent("dialogs.QuestionDialog");
        const ErrorDialog = sdk.getComponent("dialogs.ErrorDialog");

        let desc;
        if (alias) {
            desc = _t('Delete the room address %(alias)s and remove %(name)s from the directory?', {alias, name});
        } else {
            desc = _t('Remove %(name)s from the directory?', {name: name});
        }

        Modal.createTrackedDialog('Remove from Directory', '', QuestionDialog, {
            title: _t('Remove from Directory'),
            description: desc,
            onFinished: (should_delete) => {
                if (!should_delete) return;

                const Loader = sdk.getComponent("elements.Spinner");
                const modal = Modal.createDialog(Loader);
                let step = _t('remove %(name)s from the directory.', {name: name});

                MatrixClientPeg.get().setRoomDirectoryVisibility(room.room_id, 'private').then(() => {
                    if (!alias) return;
                    step = _t('delete the address.');
                    return MatrixClientPeg.get().deleteAlias(alias);
                }).then(() => {
                    modal.close();
                    this.refreshRoomList();
                }, (err) => {
                    modal.close();
                    this.refreshRoomList();
                    console.error("Failed to " + step + ": " + err);
                    Modal.createTrackedDialog('Remove from Directory Error', '', ErrorDialog, {
                        title: _t('Error'),
                        description: ((err && err.message) ? err.message : _t('The server may be unavailable or overloaded')),
                    });
                });
            },
        });
    }

    onRoomClicked = (room, ev) => {
        if (ev.shiftKey && !this.state.selectedCommunityId) {
            ev.preventDefault();
            this.removeFromDirectory(room);
        } else {
            this.showRoom(room);
        }
    };

    onOptionChange = (server, instanceId) => {
        // clear next batch so we don't try to load more rooms
        this.nextBatch = null;
        this.setState({
            // Clear the public rooms out here otherwise we needlessly
            // spend time filtering lots of rooms when we're about to
            // to clear the list anyway.
            publicRooms: [],
            roomServer: server,
            instanceId: instanceId,
            error: null,
        }, this.refreshRoomList);
        // We also refresh the room list each time even though this
        // filtering is client-side. It hopefully won't be client side
        // for very long, and we may have fetched a thousand rooms to
        // find the five gitter ones, at which point we do not want
        // to render all those rooms when switching back to 'all networks'.
        // Easiest to just blow away the state & re-fetch.
    };

    onFillRequest = (backwards) => {
        if (backwards || !this.nextBatch) return Promise.resolve(false);

        return this.getMoreRooms();
    };

    onFilterChange = (alias) => {
        this.setState({
            filterString: alias || null,
        });

        // don't send the request for a little bit,
        // no point hammering the server with a
        // request for every keystroke, let the
        // user finish typing.
        if (this.filterTimeout) {
            clearTimeout(this.filterTimeout);
        }
        this.filterTimeout = setTimeout(() => {
            this.filterTimeout = null;
            this.refreshRoomList();
        }, 700);
    };

    onFilterClear = () => {
        // update immediately
        this.setState({
            filterString: null,
        }, this.refreshRoomList);

        if (this.filterTimeout) {
            clearTimeout(this.filterTimeout);
        }
    };

    onJoinFromSearchClick = (alias) => {
        // If we don't have a particular instance id selected, just show that rooms alias
        if (!this.state.instanceId || this.state.instanceId === ALL_ROOMS) {
            // If the user specified an alias without a domain, add on whichever server is selected
            // in the dropdown
            if (alias.indexOf(':') == -1) {
                alias = alias + ':' + this.state.roomServer;
            }
            this.showRoomAlias(alias, true);
        } else {
            // This is a 3rd party protocol. Let's see if we can join it
            const protocolName = protocolNameForInstanceId(this.protocols, this.state.instanceId);
            const instance = instanceForInstanceId(this.protocols, this.state.instanceId);
            const fields = protocolName ? this._getFieldsForThirdPartyLocation(alias, this.protocols[protocolName], instance) : null;
            if (!fields) {
                const ErrorDialog = sdk.getComponent("dialogs.ErrorDialog");
                const brand = SdkConfig.get().brand;
                Modal.createTrackedDialog('Unable to join network', '', ErrorDialog, {
                    title: _t('Unable to join network'),
                    description: _t('%(brand)s does not know how to join a room on this network', { brand }),
                });
                return;
            }
            MatrixClientPeg.get().getThirdpartyLocation(protocolName, fields).then((resp) => {
                if (resp.length > 0 && resp[0].alias) {
                    this.showRoomAlias(resp[0].alias, true);
                } else {
                    const ErrorDialog = sdk.getComponent("dialogs.ErrorDialog");
                    Modal.createTrackedDialog('Room not found', '', ErrorDialog, {
                        title: _t('Room not found'),
                        description: _t('Couldn\'t find a matching Matrix room'),
                    });
                }
            }, (e) => {
                const ErrorDialog = sdk.getComponent("dialogs.ErrorDialog");
                Modal.createTrackedDialog('Fetching third party location failed', '', ErrorDialog, {
                    title: _t('Fetching third party location failed'),
                    description: _t('Unable to look up room ID from server'),
                });
            });
        }
    };

    onPreviewClick = (ev, room) => {
        this.showRoom(room, null, false, true);
        ev.stopPropagation();
    };

    onViewClick = (ev, room) => {
        this.showRoom(room);
        ev.stopPropagation();
    };

    onJoinClick = (ev, room) => {
        this.showRoom(room, null, true);
        ev.stopPropagation();
    };

    onCreateRoomClick = room => {
        this.onFinished();
        dis.dispatch({
            action: 'view_create_room',
            public: true,
        });
    };

    showRoomAlias(alias, autoJoin=false) {
        this.showRoom(null, alias, autoJoin);
    }

    showRoom(room, room_alias, autoJoin = false, shouldPeek = false) {
        this.onFinished();
        const payload = {
            action: 'view_room',
            auto_join: autoJoin,
            should_peek: shouldPeek,
            _type: "room_directory", // instrumentation
        };
        if (room) {
            // Don't let the user view a room they won't be able to either
            // peek or join: fail earlier so they don't have to click back
            // to the directory.
            if (MatrixClientPeg.get().isGuest()) {
                if (!room.world_readable && !room.guest_can_join) {
                    dis.dispatch({action: 'require_registration'});
                    return;
                }
            }

            if (!room_alias) {
                room_alias = get_display_alias_for_room(room);
            }

            payload.oob_data = {
                avatarUrl: room.avatar_url,
                // XXX: This logic is duplicated from the JS SDK which
                // would normally decide what the name is.
                name: room.name || room_alias || _t('Unnamed room'),
            };

            if (this.state.roomServer) {
                payload.via_servers = [this.state.roomServer];
                payload.opts = {
                    viaServers: [this.state.roomServer],
                };
            }
        }
        // It's not really possible to join Matrix rooms by ID because the HS has no way to know
        // which servers to start querying. However, there's no other way to join rooms in
        // this list without aliases at present, so if roomAlias isn't set here we have no
        // choice but to supply the ID.
        if (room_alias) {
            payload.room_alias = room_alias;
        } else {
            payload.room_id = room.room_id;
        }
        dis.dispatch(payload);
    }

    createRoomCells(room) {
        const client = MatrixClientPeg.get();
        const clientRoom = client.getRoom(room.room_id);
        const hasJoinedRoom = clientRoom && clientRoom.getMyMembership() === "join";
        const isGuest = client.isGuest();
        const BaseAvatar = sdk.getComponent('avatars.BaseAvatar');
        const AccessibleButton = sdk.getComponent('elements.AccessibleButton');
        let previewButton;
        let joinOrViewButton;

        // Element Web currently does not allow guests to join rooms, so we
        // instead show them preview buttons for all rooms. If the room is not
        // world readable, a modal will appear asking you to register first. If
        // it is readable, the preview appears as normal.
        if (!hasJoinedRoom && room.world_readable) {
            previewButton = (
                <AccessibleButton kind="secondary" className="tc_RoomDirectory_roomPreview" onClick={(ev) => this.onPreviewClick(ev, room)}>{_t("Preview")}</AccessibleButton>
            );
        }
        if (hasJoinedRoom) {
            joinOrViewButton = (
                <AccessibleButton kind="secondary" onClick={(ev) => this.onViewClick(ev, room)}>{_t("View")}</AccessibleButton>
            );
        } else if (!isGuest) {
            joinOrViewButton = (
                <AccessibleButton kind="primary" onClick={(ev) => this.onJoinClick(ev, room)}>{_t("Join")}</AccessibleButton>
            );
        }

        let name = room.name || get_display_alias_for_room(room) || _t('Unnamed room');
        if (name.length > MAX_NAME_LENGTH) {
            name = `${name.substring(0, MAX_NAME_LENGTH)}...`;
        }

        let topic = room.topic || '';
        // Additional truncation based on line numbers is done via CSS,
        // but to ensure that the DOM is not polluted with a huge string
        // we give it a hard limit before rendering.
        if (topic.length > MAX_TOPIC_LENGTH) {
            topic = `${topic.substring(0, MAX_TOPIC_LENGTH)}...`;
        }
        topic = linkifyAndSanitizeHtml(topic);
        const avatarUrl = getHttpUriForMxc(
                                MatrixClientPeg.get().getHomeserverUrl(),
                                room.avatar_url, 32, 32, "crop",
                            );
        return [
            <div key={ `${room.room_id}_avatar` }
                onClick={(ev) => this.onRoomClicked(room, ev)}
                // cancel onMouseDown otherwise shift-clicking highlights text
                onMouseDown={(ev) => {ev.preventDefault();}}
                className="mx_RoomDirectory_roomAvatar"
            >
                <BaseAvatar width={32} height={32} resizeMethod='crop'
                    name={ name } idName={ name }
                    url={ avatarUrl }
                />
            </div>,
            <div key={ `${room.room_id}_description` }
                onClick={(ev) => this.onRoomClicked(room, ev)}
                // cancel onMouseDown otherwise shift-clicking highlights text
                onMouseDown={(ev) => {ev.preventDefault();}}
                className="mx_RoomDirectory_roomDescription"
            >
                <div className="mx_RoomDirectory_name">{ name }</div>&nbsp;
                <div className="mx_RoomDirectory_topic"
                    onClick={ (ev) => { ev.stopPropagation(); } }
                    dangerouslySetInnerHTML={{ __html: topic }}
                />
            </div>,
            <div key={ `${room.room_id}_domain` }
                onClick={(ev) => this.onRoomClicked(room, ev)}
                // cancel onMouseDown otherwise shift-clicking highlights text
                onMouseDown={(ev) => {ev.preventDefault();}}
                className="mx_RoomDirectory_roomDomain"
            >
                { Tchap.getDomainFromId(room.room_id) }
            </div>,
            <div key={ `${room.room_id}_memberCount` }
                onClick={(ev) => this.onRoomClicked(room, ev)}
                // cancel onMouseDown otherwise shift-clicking highlights text
                onMouseDown={(ev) => {ev.preventDefault();}}
                className="mx_RoomDirectory_roomMemberCount"
            >
                { room.num_joined_members }
            </div>,
            <div key={ `${room.room_id}_preview` }
                onClick={(ev) => this.onRoomClicked(room, ev)}
                // cancel onMouseDown otherwise shift-clicking highlights text
                onMouseDown={(ev) => {ev.preventDefault();}}
                className="mx_RoomDirectory_preview"
            >
                {previewButton}
            </div>,
            <div key={ `${room.room_id}_join` }
                onClick={(ev) => this.onRoomClicked(room, ev)}
                // cancel onMouseDown otherwise shift-clicking highlights text
                onMouseDown={(ev) => {ev.preventDefault();}}
                className="mx_RoomDirectory_join"
            >
                {joinOrViewButton}
            </div>,
        ];
    }

    collectScrollPanel = (element) => {
        this.scrollPanel = element;
    };

    _stringLooksLikeId(s, field_type) {
        let pat = /^#[^\s]+:[^\s]/;
        if (field_type && field_type.regexp) {
            pat = new RegExp(field_type.regexp);
        }

        return pat.test(s);
    }

    _getFieldsForThirdPartyLocation(userInput, protocol, instance) {
        // make an object with the fields specified by that protocol. We
        // require that the values of all but the last field come from the
        // instance. The last is the user input.
        const requiredFields = protocol.location_fields;
        if (!requiredFields) return null;
        const fields = {};
        for (let i = 0; i < requiredFields.length - 1; ++i) {
            const thisField = requiredFields[i];
            if (instance.fields[thisField] === undefined) return null;
            fields[thisField] = instance.fields[thisField];
        }
        fields[requiredFields[requiredFields.length - 1]] = userInput;
        return fields;
    }

    /**
     * called by the parent component when PageUp/Down/etc is pressed.
     *
     * We pass it down to the scroll panel.
     */
    handleScrollKey = ev => {
        if (this.scrollPanel) {
            this.scrollPanel.handleScrollKey(ev);
        }
    };

    onFinished = () => {
        CountlyAnalytics.instance.trackRoomDirectory(this.startTime);
        this.props.onFinished();
    };

    render() {
        const Loader = sdk.getComponent("elements.Spinner");
        const BaseDialog = sdk.getComponent('views.dialogs.BaseDialog');
        const AccessibleButton = sdk.getComponent('elements.AccessibleButton');

        let content;
        if (this.state.error) {
            content = this.state.error;
        } else if (this.state.protocolsLoading) {
            content = <Loader />;
        } else {
            const rooms = this.state.publicRooms || [];
            rooms.sort((a, b) => {
                return b.num_joined_members - a.num_joined_members;
            });

            const cells = rooms.reduce((cells, room) => cells.concat(this.createRoomCells(room)), [],);
            // we still show the scrollpanel, at least for now, because
            // otherwise we don't fetch more because we don't get a fill
            // request from the scrollpanel because there isn't one

            let spinner;
            if (this.state.loading) {
                spinner = <Loader />;
            }

            let scrollpanel_content;
            if (cells.length === 0 && !this.state.loading) {
                scrollpanel_content = <i>{ _t('No rooms to show') }</i>;
            } else {
                scrollpanel_content = <div className="mx_RoomDirectory_table">
                    { cells }
                </div>;
            }
            const ScrollPanel = sdk.getComponent("structures.ScrollPanel");
            content = <ScrollPanel ref={this.collectScrollPanel}
                className="mx_RoomDirectory_tableWrapper"
                onFillRequest={ this.onFillRequest }
                stickyBottom={false}
                startAtBottom={false}
            >
                { scrollpanel_content }
                { spinner }
            </ScrollPanel>;
        }

        let listHeader;
        if (!this.state.protocolsLoading) {
            const DirectorySearchBox = sdk.getComponent('elements.DirectorySearchBox');

            const protocolName = protocolNameForInstanceId(this.protocols, this.state.instanceId);
            let instance_expected_field_type;
            if (
                protocolName &&
                this.protocols &&
                this.protocols[protocolName] &&
                this.protocols[protocolName].location_fields.length > 0 &&
                this.protocols[protocolName].field_types
            ) {
                const last_field = this.protocols[protocolName].location_fields.slice(-1)[0];
                instance_expected_field_type = this.protocols[protocolName].field_types[last_field];
            }

            let placeholder = _t('Find a room…');

            let showJoinButton = this._stringLooksLikeId(this.state.filterString, instance_expected_field_type);
            if (protocolName) {
                const instance = instanceForInstanceId(this.protocols, this.state.instanceId);
                if (this._getFieldsForThirdPartyLocation(this.state.filterString, this.protocols[protocolName], instance) === null) {
                    showJoinButton = false;
                }
            }

            listHeader = <div className="mx_RoomDirectory_listheader">
                <DirectorySearchBox
                    className="mx_RoomDirectory_searchbox"
                    onChange={this.onFilterChange}
                    onClear={this.onFilterClear}
                    onJoinClick={this.onJoinFromSearchClick}
                    placeholder={placeholder}
                    showJoinButton={showJoinButton}
                    initialText={this.props.initialText}
                />
            </div>;
        }
        const explanation =
            _t("If you can't find the room you're looking for, ask for an invite or <a>Create a new room</a>.", null,
                {a: sub => {
                    return (<AccessibleButton
                        kind="secondary"
                        onClick={this.onCreateRoomClick}
                    >{sub}</AccessibleButton>);
                }},
            );

        const title = _t("Explore rooms");
        return (
            <BaseDialog
                className={'mx_RoomDirectory_dialog'}
                hasCancel={true}
                onFinished={this.onFinished}
                title={title}
            >
                <div className="mx_RoomDirectory">
                    {explanation}
                    <div className="mx_RoomDirectory_list">
                        {listHeader}
                        {content}
                    </div>
                </div>
            </BaseDialog>
        );
    }
}

// Similar to matrix-react-sdk's MatrixTools.getDisplayAliasForRoom
// but works with the objects we get from the public room list
function get_display_alias_for_room(room) {
    return room.canonical_alias || (room.aliases ? room.aliases[0] : "");
}
