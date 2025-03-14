/*
Copyright 2015, 2016 OpenMarket Ltd
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
import MFileBody from './MFileBody';
import {MatrixClientPeg} from '../../../MatrixClientPeg';
import { decryptFile } from '../../../utils/DecryptFile';
import ContentScanner  from '../../../tchap/utils/ContentScanner';
import { _t } from '../../../languageHandler';
import SettingsStore from "../../../settings/SettingsStore";
import InlineSpinner from '../elements/InlineSpinner';

interface IProps {
    /* the MatrixEvent to show */
    mxEvent: any;
    /* called when the video has loaded */
    onHeightChanged: () => void;
}

interface IState {
    decryptedUrl: string|null,
    decryptedThumbnailUrl: string|null,
    decryptedBlob: Blob|null,
    error: any|null,
    fetchingData: boolean,
}

export default class MVideoBody extends React.PureComponent<IProps, IState> {
    private videoRef = React.createRef<HTMLVideoElement>();

    constructor(props) {
        super(props);
        this.state = {
            fetchingData: false,
            decryptedUrl: null,
            decryptedThumbnailUrl: null,
            decryptedBlob: null,
            contentUrl: null,
            isClean: null,
            error: null,
        }
    }

    thumbScale(fullWidth: number, fullHeight: number, thumbWidth: number, thumbHeight: number) {
        if (!fullWidth || !fullHeight) {
            // Cannot calculate thumbnail height for image: missing w/h in metadata. We can't even
            // log this because it's spammy
            return undefined;
        }
        if (fullWidth < thumbWidth && fullHeight < thumbHeight) {
            // no scaling needs to be applied
            return 1;
        }
        const widthMulti = thumbWidth / fullWidth;
        const heightMulti = thumbHeight / fullHeight;
        if (widthMulti < heightMulti) {
            // width is the dominant dimension so scaling will be fixed on that
            return widthMulti;
        } else {
            // height is the dominant dimension so scaling will be fixed on that
            return heightMulti;
        }
    }

    private getContentUrl(): string|null {
        const content = this.props.mxEvent.getContent();
        if (content.file !== undefined) {
            return this.state.decryptedUrl;
        } else {
            return this.state.contentUrl;
        }
    }

    private hasContentUrl(): boolean {
        const url = this.getContentUrl();
        return url && !url.startsWith("data:");
    }

    private getThumbUrl(): string|null {
        const content = this.props.mxEvent.getContent();
        if (content.file !== undefined) {
            return this.state.decryptedThumbnailUrl;
        } else if (content.info && content.info.thumbnail_url) {
            return ContentScanner.getUnencryptedContentUrl(content, true);
        } else {
            return null;
        }
    }

    async componentDidMount() {
        const autoplay = SettingsStore.getValue("autoplayGifsAndVideos") as boolean;
        const content = this.props.mxEvent.getContent();
        if (content.file !== undefined && this.state.decryptedUrl === null) {
            ContentScanner.scanContent(content).then(result => {
                if (result.clean === true) {
                    this.setState({
                        isClean: true,
                    });
                    let thumbnailPromise = Promise.resolve(null);
                    if (content.info && content.info.thumbnail_file) {
                        thumbnailPromise = ContentScanner.downloadEncryptedContent(content, true
                        ).then(blob => {
                            return URL.createObjectURL(blob);
                        });
                    }
                    let decryptedBlob;
                    thumbnailPromise.then(thumbnailUrl => {
                        return Promise.resolve(ContentScanner.downloadEncryptedContent(content)
                        ).then(blob => {
                            decryptedBlob = blob;
                            return URL.createObjectURL(blob);
                        }).then(contentUrl => {
                            this.setState({
                                decryptedUrl: contentUrl,
                                decryptedThumbnailUrl: thumbnailUrl,
                                decryptedBlob: decryptedBlob,
                            });
                        });
                    }).catch((err) => {
                        console.warn("Unable to decrypt attachment: ", err);
                        // Set a placeholder image when we can't decrypt the image.
                        this.setState({
                            error: err,
                        });
                    });
                } else {
                    this.setState({
                        isClean: false,
                    });
                }
            });
        } else if (content.url !== undefined && this.state.contentUrl === null) {
            ContentScanner.scanContent(content).then(result => {
                if (result.clean === true) {
                    this.setState({
                        contentUrl: ContentScanner.getUnencryptedContentUrl(content),
                        isClean: true,
                    });
                } else {
                    this.setState({
                        isClean: false,
                    });
                }
            });
        }
    }

    componentWillUnmount() {
        if (this.state.decryptedUrl) {
            URL.revokeObjectURL(this.state.decryptedUrl);
        }
        if (this.state.decryptedThumbnailUrl) {
            URL.revokeObjectURL(this.state.decryptedThumbnailUrl);
        }
    }

    private videoOnPlay = async () => {
        if (this.hasContentUrl() || this.state.fetchingData || this.state.error) {
            // We have the file, we are fetching the file, or there is an error.
            return;
        }
        this.setState({
            // To stop subsequent download attempts
            fetchingData: true,
        });
        const content = this.props.mxEvent.getContent();
        if (!content.file) {
            this.setState({
                error: "No file given in content",
            });
            return;
        }
        const decryptedBlob = await decryptFile(content.file);
        const contentUrl = URL.createObjectURL(decryptedBlob);
        this.setState({
            decryptedUrl: contentUrl,
            decryptedBlob: decryptedBlob,
            fetchingData: false,
        }, () => {
            if (!this.videoRef.current) return;
            this.videoRef.current.play();
        });
        this.props.onHeightChanged();
    }

    render() {
        const content = this.props.mxEvent.getContent();
        const autoplay = SettingsStore.getValue("autoplayGifsAndVideos");

        if (this.state.error !== null) {
            return (
                <span className="mx_MVideoBody">
                    <img src={require("../../../../res/img/warning.svg")} className="tc_MCS_error" width="16" height="16" />
                    { _t("Error decrypting video") }
                </span>
            );
        }

        // Important: If we aren't autoplaying and we haven't decrypred it yet, show a video with a poster.
        if (content.file !== undefined && this.state.decryptedUrl === null && autoplay) {
            // Need to decrypt the attachment
            // The attachment is decrypted in componentDidMount.
            // For now add an img tag with a spinner.
            return (
                <span className="mx_MVideoBody">
                    <div className="mx_MImageBody_thumbnail mx_MImageBody_thumbnail_spinner">
                        <InlineSpinner />
                    </div>
                </span>
            );
        }

        const contentUrl = this.getContentUrl();
        const thumbUrl = this.getThumbUrl();
        let height = null;
        let width = null;
        let poster = null;
        let preload = "metadata";
        if (content.info) {
            const scale = this.thumbScale(content.info.w, content.info.h, 480, 360);
            if (scale) {
                width = Math.floor(content.info.w * scale);
                height = Math.floor(content.info.h * scale);
            }

            if (thumbUrl) {
                poster = thumbUrl;
                preload = "none";
            }
        }
        return (
            <span className="mx_MVideoBody">
                <video
                    className="mx_MVideoBody"
                    ref={this.videoRef}
                    src={contentUrl}
                    title={content.body}
                    controls
                    preload={preload}
                    muted={autoplay}
                    autoPlay={autoplay}
                    height={height}
                    width={width}
                    poster={poster}
                    onPlay={this.videoOnPlay}
                >
                </video>
                <MFileBody {...this.props} decryptedBlob={this.state.decryptedBlob} />
            </span>
        );
    }
}
