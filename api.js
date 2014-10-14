var RTC = setupRTC();
var RTCPeerconnection = RTC.peerconnection;

function goWebRTC(opts) {
    var self = this;
    var options = opts || {};
    var config = this.config = {
            url: '/http-bind',
            domain: window.location.hostname,
            conference: 'conference',
            debug: false,
            localVideoEl: '',
            remoteVideosEl: '',
            autoRemoveVideos: true
        };
    var item, connection;
    for (item in options) {
        this.config[item] = options[item];
    }
    // call WildEmitter constructor
    WildEmitter.call(this);

    this.peers = {};

    var connection = this.connection = new Strophe.Connection(config.url);
    if (config.debug) {
        connection.rawInput = function(data) { console.log('RECV: ' + data); };
        connection.rawOutput = function(data) { console.log('SEND: ' + data); };
    }
    connection.jingle.pc_constraints = RTC.pc_constraints;
    connection.jingle.ice_config = {iceServers: [{url: 'stun:stun.l.google.com:19302'}]},

    connection.connect(config.domain, null, function(status) {
        if (status == Strophe.Status.CONNECTED) {
            self.testReadiness();
        }
    });
    this.localStream = null;
    $(document).bind('mediaready.jingle', function(event, stream) {
        self.localStream = stream;
        connection.jingle.localStream = stream;
        var local = document.getElementById(self.config.localVideoEl);
        if (local != null) {
            local.muted = true;
            local.volume = 0;
            local.autoplay = true;
            RTC.attachMediaStream($(local), stream);
        }
        self.testReadiness();
    });
    $(document).bind('mediafailure.jingle', function() {
        console.warn('could not get media');
    });
    $(document).bind('callincoming.jingle', function(event, sid) {
        console.log('incoming call');
        var sess = connection.jingle.sessions[sid];
        sess.sendAnswer();
        sess.accept();
    });
    $(document).bind('callactive.jingle', function(event, video, sid) {
        console.log('call active');
        $('#' + self.config.remoteVideosEl).append(video);
        video.show();
        self.emit('videoAdded', video, sid);
    });
    $(document).bind('callterminated.jingle', function(event, sid, reason) {
        console.log('call terminated');
        var video = $('#' + self.config.remoteVideosEl).find('>#' + self.config.remoteVideosEl + '_' + sid);
        if (self.config.autoRemoveVideos) {
            video.remove();
        }
        self.emit('videoRemoved', video, sid);
    });

    /*
    $(document).bind('nostuncandidates.jingle', noStunCandidates);

    //$(document).bind('showmailbutton', onShowMailbutton);
    $(document).bind('warn', function(event, data) { setStatusOverlay(data); });
    */

    $(document).bind('remotestreamadded.jingle', function(event, data, sid) {
        if ($('#' + self.config.remoteVideosEl).find('>#' + self.config.remoteVideosEl + '_' + sid).length) {
            return;
        }
        console.log('added remote stream for sid', sid);
        // after remote stream has been added, wait for ice to become connected
        // old code for compat with FF22
        if (RTC.browser == 'firefox') {
            var el = $('<video autoplay="autoplay" style="display:none" oncontextmenu="return false;"/>').attr('id', self.config.remoteVideosEl + '_' + sid);
            RTC.attachMediaStream($(el), data.stream);
            this.waitForRemoteVideo(el, sid);
        }
    });
    /*
    $(document).bind('remotestreamremoved.jingle', onRemoteStreamRemoved);
    */
    $(document).bind('iceconnectionstatechange.jingle', function(event, sid, sess) {
        console.log('ice state for', sid, sess.peerconnection.iceConnectionState);
        console.log('sig state for', sid, sess.peerconnection.signalingState);
        // works like charm, unfortunately only in chrome and FF nightly, not FF22 beta
        if (sess.peerconnection.signalingState == 'stable' && 
            (sess.peerconnection.iceConnectionState == 'connected' || sess.peerconnection.iceConnectionState == 'completed')) {
            if ($('#' + self.config.remoteVideosEl).find('>#' + sid).length) {
                console.log('ignoring duplicate iceconnectionstate for', sid);
                return;
            }
            var el = $('<video autoplay="autoplay" style="display:none" oncontextmenu="return false;"/>').attr('id', self.config.remoteVideosEl + '_' + sid);
            $(document).trigger('callactive.jingle', [el, sid]);
            RTC.attachMediaStream($(el), sess.remoteStream); // moving this before the trigger doesn't work in FF?!
        }
    });

    /*
    $(document).bind('ringing.jingle', function(event, sid) {
         console.log('session', sid, 'ringing');
     });
     */
    $(document).bind('mute.jingle', function(event, sid, content) {
         console.log('session', sid, 'mute:', content);
     });
    $(document).bind('unmute.jingle', function(event, sid, content) {
         console.log('session', sid, 'unmute:', content);
     });
    $(window).bind('beforeunload', function() {
        if (self.connection && self.connection.connected) {
            // ensure signout
            $.ajax({
                    type: 'POST',
                    url: '/http-bind',
                    async: false,
                    cache: false,
                    contentType: 'application/xml',
                    data: "<body rid='" + self.connection.rid + "' xmlns='http://jabber.org/protocol/httpbind' sid='" + self.connection.sid + "' type='terminate'><presence xmlns='jabber:client' type='unavailable'/></body>",
                    success: function(data) {
                        console.log('signed out');
                        console.log(data);
                    },
                    error: function(XMLHttpRequest, textStatus, errorThrown) {
                        console.log('signout error', textStatus + ' (' + errorThrown + ')');
                    }
            });
        }
    });
    if (config.autoRequestMedia) {
        this.startLocalMedia();
    }
}

goWebRTC.prototype = Object.create(WildEmitter.prototype, {
    constructor: {
        value: goWebRTC
    }
});

goWebRTC.prototype.startLocalMedia = function() {
    getUserMediaWithConstraints(['audio', 'video']);
};

goWebRTC.prototype.waitForRemoteVideo = function(videoel, sid) {
    var sess = this.connection.jingle.sessions[sid];
    var videoTracks = sess.remoteStream.getVideoTracks();
    if (videoTracks.length === 0 || videoel[0].currentTime > 0) {
        $(document).trigger('callactive.jingle', [videoel, sid]);
        RTC.attachMediaStream(videoel, sess.remoteStream); // FIXME: why do i have to do this for FF?
        //console.log('waitForremotevideo', sess.peerconnection.iceConnectionState, sess.peerconnection.signalingState);
    } else {
        setTimeout(function() { this.waitForRemoteVideo(videoel, sid); }, 100);
    }
};

goWebRTC.prototype.testReadiness = function() {
    var self = this;
    if (this.localStream && this.connection.connected && Strophe.getNodeFromJid(this.connection.jid) != null) {
        this.emit('readyToCall');
    }
};

goWebRTC.prototype.joinRoom = function(name) {
    this.roomName = name + '@' + this.config.conference + '.' + this.config.domain;
    this.nickname = Strophe.getNodeFromJid(this.connection.jid);
    this.connection.addHandler(this.onPresence.bind(this), null, 'presence', null, null, this.roomName, {matchBare: true});
    this.connection.addHandler(this.onPresenceUnavailable.bind(this), null, 'presence', 'unavailable', null, this.roomName, {matchBare: true});

    pres = $pres({to: this.roomName + '/' + this.nickname })
            .c('x', {xmlns: 'http://jabber.org/protocol/muc'});
    this.connection.send(pres);
};

goWebRTC.prototype.onPresence = function(pres) {
    var from = pres.getAttribute('from'),
        type = pres.getAttribute('type');
    if (type != null) {
        return true;
    }
    if ($(pres).find('>x[xmlns="http://jabber.org/protocol/muc#user"]>status[code="201"]').length) {
        // http://xmpp.org/extensions/xep-0045.html#createroom-instant
        var create = $iq({type: 'set', to: this.roomName})
                .c('query', {xmlns: 'http://jabber.org/protocol/muc#owner'})
                .c('x', {xmlns: 'jabber:x:data', type: 'submit'});
        this.connection.send(create); // fire away
    }
    if (from == this.roomName + '/' + this.nickname) {
        this.emit('joinedRoom');
        for (var peer in this.peers) {
            this.connection.jingle.initiate(peer, this.roomName + '/' + this.nickname);
        }
    } else {
        this.peers[from] = 1;
    }
    return true;
};

goWebRTC.prototype.onPresenceUnavailable = function(pres) {
    this.connection.jingle.terminateByJid($(pres).attr('from'));
    delete this.peers[from];
    return true;
};
