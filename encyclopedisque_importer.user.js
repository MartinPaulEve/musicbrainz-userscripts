// ==UserScript==
// @name           Import Encyclopedisque releases to MusicBrainz
// @version        2011-08-20_02
// @namespace      http://userscripts.org/users/22504
// @description    Easily import Encyclopedisque releases into MusicBrainz
// @include        http://www.encyclopedisque.fr/disque/*.html
// @require        http://ajax.googleapis.com/ajax/libs/jquery/1.3.2/jquery.js
// @require        http://userscripts.org/scripts/source/110844.user.js
// ==/UserScript==

// Script Update Checker

var SUC_script_num = 82627; // Change this to the number given to the script by userscripts.org (check the address bar)

try{function updateCheck(forced){if ((forced) || (parseInt(GM_getValue('SUC_last_update', '0')) + 86400000 <= (new Date().getTime()))){try{GM_xmlhttpRequest({method: 'GET',url: 'http://userscripts.org/scripts/source/'+SUC_script_num+'.meta.js?'+new Date().getTime(),headers: {'Cache-Control': 'no-cache'},onload: function(resp){var local_version, remote_version, rt, script_name;rt=resp.responseText;GM_setValue('SUC_last_update', new Date().getTime()+'');remote_version=parseInt(/@uso:version\s*(.*?)\s*$/m.exec(rt)[1]);local_version=parseInt(GM_getValue('SUC_current_version', '-1'));if(local_version!=-1){script_name = (/@name\s*(.*?)\s*$/m.exec(rt))[1];GM_setValue('SUC_target_script_name', script_name);if (remote_version > local_version){if(confirm('There is an update available for the Greasemonkey script "'+script_name+'."\nWould you like to go to the install page now?')){GM_openInTab('http://userscripts.org/scripts/show/'+SUC_script_num);GM_setValue('SUC_current_version', remote_version);}}else if (forced)alert('No update is available for "'+script_name+'."');}else GM_setValue('SUC_current_version', remote_version+'');}});}catch (err){if (forced)alert('An error occurred while checking for updates:\n'+err);}}}GM_registerMenuCommand(GM_getValue('SUC_target_script_name', '???') + ' - Manual Update Check', function(){updateCheck(true);});updateCheck(false);}catch(err){}


$(document).ready(function() {

	var release = parseEncyclopedisquePage();
    setupUI(release);

});

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                             Encyclopedisque functions
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////


function setupUI(release) {

	// Form parameters
    var edit_note = 'Imported from ' + window.location.href;
	var parameters = MBReleaseImportHelper.buildFormParameters(release, edit_note);

	// Build form
	var innerHTML = MBReleaseImportHelper.buildFormHTML(parameters);
	
    // Append search link
	innerHTML += ' <small>(' + MBReleaseImportHelper.buildSearchLink(release) + ')</small>';

	var importLink = $("<li>"+ innerHTML + "</li>");
	importLink.appendTo("#menu ul");

}

// Analyze Encyclopedisque data and prepare to release object
function parseEncyclopedisquePage() {

	release = new Object();
	
	var infoHeader =  document.body.querySelector("#contenu > h2:nth-of-type(1)");

	// Release artist credit
    release.artist_credit = new Array();
	var artist_name = infoHeader.querySelector("div.floatright:nth-of-type(1)").textContent.trim();
    release.artist_credit.push( { 'artist_name': artist_name } );

    // Release title
	release.title = infoHeader.querySelector("span:nth-of-type(1)").textContent.trim();

    // Release country
	release.country = 'FR'; // France - correct in most case, but not all

    // Other hard-coded info
    release.type = 'single';
    release.status = 'official';
    release.language = 'fra';
    release.script = 'Latn';

    var disc = {'position': 1, 'tracks': [] };
	disc.format = '7" Vinyl'; // Disque vinyl 7"
	release.discs = [ disc ];

	// Parse other infos
	var releaseInfos = document.body.querySelectorAll("div.pochetteprincipale ~ div tr");
	for (var i = 0; i < releaseInfos.length; i++) {
		var infoType = releaseInfos[i].querySelector("td:nth-of-type(1)").textContent.trim();
		
		// Release date
		if (infoType == "Sortie :") {
			var infoValue = releaseInfos[i].querySelector("td:nth-of-type(2)").textContent.trim();
			var re = /\s*(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)?\s*([\d\?]{4})?\s*(?:chez)?\s*((?:\S+\s?)*)\s*\(?([^\)]*)?\)?/;
			console.log(infoValue);
			console.log(infoValue.match(re));
			//if (m = infoValue.match(re) != null) {
			m = infoValue.match(re);
			month = m[1];
			if (month != undefined) {
				switch (month)
				{
					case "janvier":		release.month = 1; break;
					case "février":		release.month = 2; break;
					case "mars":		release.month = 3; break;
					case "avril":		release.month = 4; break;
					case "mai":			release.month = 5; break;
					case "juin":		release.month = 6; break;
					case "juillet":		release.month = 7; break;
					case "août":		release.month = 8; break;
					case "septembre":	release.month = 9; break;
					case "octobre":		release.month = 10; break;
					case "novembre":	release.month = 11; break;
					case "décembre":	release.month = 12; break;
				}
			}
			release.year = m[2];
            release.labels = [ { 'catno': m[4] } ]
			var label = m[3];
			if (label != undefined) release.labels[0].name = label.trim();
			//}
		} 
		// Tracks
		else if (infoType.match(/^Face [AB]/)) {
			var title = releaseInfos[i].querySelector("td:nth-of-type(2) strong").textContent.trim();
			var track = new Object();
			track.title = title; //.replace("(avec ", "(feat. ");
			disc.tracks.push(track);
		}
		
	}

	return release;
}

