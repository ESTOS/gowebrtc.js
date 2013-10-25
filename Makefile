STROPHE=strophe.js strophe.disco.js strophe.jingle/strophe.jingle.js strophe.jingle/strophe.jingle.session.js strophe.jingle/strophe.jingle.sdp.js strophe.jingle/strophe.jingle.adapter.js
HARK=hark.bundle.js wildemitter-bare.js
JQUERY=jquery.min.js
API=api.js


all: gowebrtc.js

gowebrtc.js: $(API) $(STROPHE)
	uglifyjs $(API) $(STROPHE) $(HARK) $(JQUERY) -o gowebrtc.js
