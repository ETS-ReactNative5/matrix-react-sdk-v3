/*
Copyright 2015, 2016 OpenMarket Ltd
Copyright 2018 New Vector Ltd
Copyright 2018, 2019 Michael Telatynski <7t3chguy@gmail.com>

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

import React, {createRef} from 'react';
import PropTypes from 'prop-types';

import MFileBody from './MFileBody';
import Modal from '../../../Modal';
import * as sdk from '../../../index';
import ContentScanner from '../../../tchap/utils/ContentScanner';
import { _t } from '../../../languageHandler';
import SettingsStore from "../../../settings/SettingsStore";
import MatrixClientContext from "../../../contexts/MatrixClientContext";
import InlineSpinner from '../elements/InlineSpinner';

export default class MImageBody extends React.Component {
    static propTypes = {
        /* the MatrixEvent to show */
        mxEvent: PropTypes.object.isRequired,

        /* called when the image has loaded */
        onHeightChanged: PropTypes.func.isRequired,

        /* the maximum image height to use */
        maxImageHeight: PropTypes.number,
    };

    static contextType = MatrixClientContext;

    constructor(props) {
        super(props);

        this.onImageError = this.onImageError.bind(this);
        this.onImageLoad = this.onImageLoad.bind(this);
        this.onImageEnter = this.onImageEnter.bind(this);
        this.onImageLeave = this.onImageLeave.bind(this);
        this.onClientSync = this.onClientSync.bind(this);
        this.onClick = this.onClick.bind(this);
        this._isGif = this._isGif.bind(this);

        this.state = {
            decryptedUrl: null,
            decryptedThumbnailUrl: null,
            decryptedBlob: null,
            error: null,
            imgError: false,
            imgLoaded: false,
            loadedImageDimensions: null,
            hover: false,
            showImage: SettingsStore.getValue("showImages"),
            contentUrl: null,
            isClean: null,
        };

        this._image = createRef();
    }

    // FIXME: factor this out and aplpy it to MVideoBody and MAudioBody too!
    onClientSync(syncState, prevState) {
        if (this.unmounted) return;
        // Consider the client reconnected if there is no error with syncing.
        // This means the state could be RECONNECTING, SYNCING, PREPARED or CATCHUP.
        const reconnected = syncState !== "ERROR" && prevState !== syncState;
        if (reconnected && this.state.imgError) {
            // Load the image again
            this.setState({
                imgError: false,
            });
        }
    }

    showImage() {
        localStorage.setItem("mx_ShowImage_" + this.props.mxEvent.getId(), "true");
        this.setState({showImage: true});
        this._downloadImage();
    }

    onClick(ev) {
        if (ev.button === 0 && !ev.metaKey) {
            ev.preventDefault();
            if (!this.state.showImage) {
                this.showImage();
                return;
            }

            const content = this.props.mxEvent.getContent();
            const httpUrl = this._getContentUrl();
            const ImageView = sdk.getComponent("elements.ImageView");
            const params = {
                src: httpUrl,
                name: content.body && content.body.length > 0 ? content.body : _t('Attachment'),
                mxEvent: this.props.mxEvent,
            };

            if (content.info) {
                params.width = content.info.w;
                params.height = content.info.h;
                params.fileSize = content.info.size;
            }

            Modal.createDialog(ImageView, params, "mx_Dialog_lightbox");
        }
    }

    _isGif() {
        const content = this.props.mxEvent.getContent();
        return (
          content &&
          content.info &&
          content.info.mimetype === "image/gif"
        );
    }

    onImageEnter(e) {
        this.setState({ hover: true });

        if (!this.state.showImage || !this._isGif() || SettingsStore.getValue("autoplayGifsAndVideos")) {
            return;
        }
        const imgElement = e.target;
        imgElement.src = this._getContentUrl();
    }

    onImageLeave(e) {
        this.setState({ hover: false });

        if (!this.state.showImage || !this._isGif() || SettingsStore.getValue("autoplayGifsAndVideos")) {
            return;
        }
        const imgElement = e.target;
        imgElement.src = this._getThumbUrl();
    }

    onImageError() {
        this.setState({
            imgError: true,
        });
    }

    onImageLoad() {
        this.props.onHeightChanged();

        let loadedImageDimensions;

        if (this._image.current) {
            const { naturalWidth, naturalHeight } = this._image.current;
            // this is only used as a fallback in case content.info.w/h is missing
            loadedImageDimensions = { naturalWidth, naturalHeight };
        }

        this.setState({ imgLoaded: true, loadedImageDimensions });
    }

    _getContentUrl() {
        const content = this.props.mxEvent.getContent();
        if (content.file !== undefined) {
            return this.state.decryptedUrl;
        } else {
            return this.state.contentUrl;
        }
    }

    _getThumbUrl() {
        const content = this.props.mxEvent.getContent();
        if (content.file !== undefined) {
            // Don't use the thumbnail for clients wishing to autoplay gifs.
            if (this.state.decryptedThumbnailUrl) {
                return this.state.decryptedThumbnailUrl;
            }
            return this.state.decryptedUrl;
        } else if (content.info && content.info.mimetype === "image/svg+xml" && content.info.thumbnail_url) {
            // special case to return clientside sender-generated thumbnails for SVGs, if any,
            // given we deliberately don't thumbnail them serverside to prevent
            // billion lol attacks and similar
            return ContentScanner.getUnencryptedContentUrl(content, true);
        } else {
            return ContentScanner.getUnencryptedContentUrl(content, true);
        }
    }

    _downloadImage() {
        const content = this.props.mxEvent.getContent();
        if (content.file !== undefined && this.state.decryptedUrl === null) {
            ContentScanner.scanContent(content).then(result => {
                if (result.clean === true) {
                    this.setState({
                        isClean: true,
                    });
                    let thumbnailPromise = Promise.resolve(null);
                    if (content.info && content.info.thumbnail_file) {
                        thumbnailPromise = ContentScanner.downloadEncryptedContent(content, true).then(blob => {
                            return URL.createObjectURL(blob);
                        });
                    }
                    let decryptedBlob;
                    thumbnailPromise.then((thumbnailUrl) => {
                        return Promise.resolve(ContentScanner.downloadEncryptedContent(content)).then(function(blob) {
                            decryptedBlob = blob;
                            return URL.createObjectURL(blob);
                        }).then((contentUrl) => {
                            this.setState({
                                decryptedUrl: contentUrl,
                                decryptedThumbnailUrl: thumbnailUrl,
                                decryptedBlob: decryptedBlob,
                            });
                        }).catch(err => {
                            this.setState({
                                isClean: false,
                                error: err.error,
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
            }).catch(err => {
                this.setState({
                    isClean: false,
                    error: err.error,
                });
            });
        } else if (content.url !== undefined && this.state.contentUrl === null) {
            ContentScanner.scanContent(content).then(result => {
                if (result.clean === true) {
                    this.setState({
                        contentUrl: ContentScanner.getUnencryptedContentUrl(content),
                        isClean: true,
                    })
                }
            }).catch(err => {
                this.setState({
                    isClean: false,
                    error: err.error,
                });
            });
        } else {
            this.setState({
                isClean: false,
            });
        }
    }

    componentDidMount() {
        this.unmounted = false;
        this.context.on('sync', this.onClientSync);

        const showImage = this.state.showImage ||
            localStorage.getItem("mx_ShowImage_" + this.props.mxEvent.getId()) === "true";

        if (showImage) {
            // Don't download anything becaue we don't want to display anything.
            this._downloadImage();
            this.setState({showImage: true});
        }

        this._afterComponentDidMount();
    }

    // To be overridden by subclasses (e.g. MStickerBody) for further
    // initialisation after componentDidMount
    _afterComponentDidMount() {
    }

    componentWillUnmount() {
        this.unmounted = true;
        this.context.removeListener('sync', this.onClientSync);
        this._afterComponentWillUnmount();

        if (this.state.decryptedUrl) {
            URL.revokeObjectURL(this.state.decryptedUrl);
        }
        if (this.state.decryptedThumbnailUrl) {
            URL.revokeObjectURL(this.state.decryptedThumbnailUrl);
        }
    }

    // To be overridden by subclasses (e.g. MStickerBody) for further
    // cleanup after componentWillUnmount
    _afterComponentWillUnmount() {
    }

    _messageContent(contentUrl, thumbUrl, content) {
        let infoWidth;
        let infoHeight;

        if (content && content.info && content.info.w && content.info.h) {
            infoWidth = content.info.w;
            infoHeight = content.info.h;
        } else {
            // Whilst the image loads, display nothing.
            //
            // Once loaded, use the loaded image dimensions stored in `loadedImageDimensions`.
            //
            // By doing this, the image "pops" into the timeline, but is still restricted
            // by the same width and height logic below.
            if (!this.state.loadedImageDimensions) {
                let imageElement;
                if (!this.state.showImage) {
                    imageElement = <HiddenImagePlaceholder />;
                } else {
                    imageElement = (
                        <img style={{display: 'none'}} src={thumbUrl} ref={this._image}
                             alt={content.body}
                             onError={this.onImageError}
                             onLoad={this.onImageLoad}
                        />
                    );
                }
                return this.wrapImage(contentUrl, imageElement);
            }
            infoWidth = this.state.loadedImageDimensions.naturalWidth;
            infoHeight = this.state.loadedImageDimensions.naturalHeight;
        }

        // The maximum height of the thumbnail as it is rendered as an <img>
        const maxHeight = Math.min(this.props.maxImageHeight || 600, infoHeight);
        // The maximum width of the thumbnail, as dictated by its natural
        // maximum height.
        const maxWidth = infoWidth * maxHeight / infoHeight;

        let img = null;
        let placeholder = null;
        let gifLabel = null;

        // e2e image hasn't been decrypted yet
        if (content.file !== undefined && this.state.decryptedUrl === null) {
            placeholder = <InlineSpinner w={32} h={32} />;
        } else if (!this.state.imgLoaded) {
            // Deliberately, getSpinner is left unimplemented here, MStickerBody overides
            placeholder = this.getPlaceholder();
        }

        let showPlaceholder = Boolean(placeholder);

        if (thumbUrl && !this.state.imgError) {
            // Restrict the width of the thumbnail here, otherwise it will fill the container
            // which has the same width as the timeline
            // mx_MImageBody_thumbnail resizes img to exactly container size
            img = (
                <img className="mx_MImageBody_thumbnail" src={thumbUrl} ref={this._image}
                     style={{ maxWidth: maxWidth + "px" }}
                     alt={content.body}
                     onError={this.onImageError}
                     onLoad={this.onImageLoad}
                     onMouseEnter={this.onImageEnter}
                     onMouseLeave={this.onImageLeave} />
            );
        }

        if (!this.state.showImage) {
            img = <HiddenImagePlaceholder style={{ maxWidth: maxWidth + "px" }} />;
            showPlaceholder = false; // because we're hiding the image, so don't show the sticker icon.
        }

        if (this._isGif() && !SettingsStore.getValue("autoplayGifsAndVideos") && !this.state.hover) {
            gifLabel = <p className="mx_MImageBody_gifLabel">GIF</p>;
        }

        const thumbnail = (
            <div className="mx_MImageBody_thumbnail_container" style={{ maxHeight: maxHeight + "px" }} >
                { /* Calculate aspect ratio, using %padding will size _container correctly */ }
                <div style={{ paddingBottom: (100 * infoHeight / infoWidth) + '%' }} />
                { showPlaceholder &&
                    <div className="mx_MImageBody_thumbnail" style={{
                        // Constrain width here so that spinner appears central to the loaded thumbnail
                        maxWidth: infoWidth + "px",
                    }}>
                        <div className="mx_MImageBody_thumbnail_spinner">
                            { placeholder }
                        </div>
                    </div>
                }

                <div style={{display: !showPlaceholder ? undefined : 'none'}}>
                    { img }
                    { gifLabel }
                </div>

                { this.state.hover && this.getTooltip() }
            </div>
        );

        return this.wrapImage(contentUrl, thumbnail);
    }

    // Overidden by MStickerBody
    wrapImage(contentUrl, children) {
        return <a href={contentUrl} onClick={this.onClick}>
            {children}
        </a>;
    }

    // Overidden by MStickerBody
    getPlaceholder() {
        // MImageBody doesn't show a placeholder whilst the image loads, (but it could do)
        return null;
    }

    // Overidden by MStickerBody
    getTooltip() {
        return null;
    }

    // Overidden by MStickerBody
    getFileBody() {
        return <MFileBody {...this.props} decryptedBlob={this.state.decryptedBlob} />;
    }

    render() {
        const content = this.props.mxEvent.getContent();
        const isClean = this.state.isClean;

        if (this.state.error !== null) {
            return (
                <span className="mx_MImageBody">
                    <img src={require("../../../../res/img/warning.svg")} className="tc_MCS_error" width="16" height="16"  alt="warning"/>
                    { _t(this.state.error) }
                </span>
            );
        }

        if (isClean === null) {
            return (
                <span className="mx_MFileBody" ref="body">
                    <img
                        src={require("../../../../res/img/spinner.gif")}
                        alt={ _t("Analysis in progress") }
                        width="32"
                        height="32"
                    />
                    { _t("Analysis in progress") }
                </span>
            );
        } else if (isClean === false) {
            return (
                <span className="mx_MFileBody" ref="body">
                    <img src={require("../../../../res/img/warning.svg")} className="tc_MCS_error" width="16" height="16"  alt="warning"/>
                    { _t("The file %(file)s was rejected by the security policy", {file: content.body}) }
                </span>
            );
        }

        const contentUrl = this._getContentUrl();
        let thumbUrl;
        if (this._isGif() && SettingsStore.getValue("autoplayGifsAndVideos")) {
          thumbUrl = contentUrl;
        } else {
          thumbUrl = this._getThumbUrl();
        }

        const thumbnail = this._messageContent(contentUrl, thumbUrl, content);
        const fileBody = this.getFileBody();

        return <span className="mx_MImageBody">
            { thumbnail }
            { fileBody }
        </span>;
    }
}

export class HiddenImagePlaceholder extends React.PureComponent {
    static propTypes = {
        hover: PropTypes.bool,
    };

    render() {
        let className = 'mx_HiddenImagePlaceholder';
        if (this.props.hover) className += ' mx_HiddenImagePlaceholder_hover';
        return (
            <div className={className}>
                <div className='mx_HiddenImagePlaceholder_button'>
                    <span className='mx_HiddenImagePlaceholder_eye' />
                    <span>{_t("Show image")}</span>
                </div>
            </div>
        );
    }
}
