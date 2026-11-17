/**
 * Kentish Town Vegbox – member survey: Google Sheet receiver.
 *
 * Lives in the Apps Script project attached to the survey responses Sheet
 * (Sheet -> Extensions -> Apps Script). The website's /api/survey function
 * posts each response here; this appends it as a row and saves any uploaded
 * picture into a Drive folder, with a link in the last column.
 *
 * One-off set-up: see README.md alongside this file.
 */

var PHOTO_FOLDER_NAME = 'Member survey 2026 - photos';
var SHEET_NAME = 'Responses';

/** Run once from the editor. Creates the photo folder and prints the secret. */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var secret = props.getProperty('SURVEY_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('SURVEY_SECRET', secret);
  }
  var folder = getPhotoFolder_();
  getSheet_();
  Logger.log('SURVEY_SECRET (paste into Cloudflare): ' + secret);
  Logger.log('Photos will be saved in: ' + folder.getUrl());
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('SURVEY_SECRET');
    if (!secret || body.secret !== secret) return out_({ ok: false, error: 'unauthorised' });
    if (!Array.isArray(body.row) || !Array.isArray(body.headers)) return out_({ ok: false, error: 'bad request' });

    var now = new Date();
    var photoUrl = '';
    if (body.photo && body.photo.data) {
      var stamp = Utilities.formatDate(now, 'Europe/London', 'yyyy-MM-dd-HHmmss');
      var name = 'survey-photo-' + stamp + '-' + Utilities.getUuid().slice(0, 4) + '.' + (body.photo.ext || 'jpg');
      var blob = Utilities.newBlob(Utilities.base64Decode(body.photo.data), body.photo.type, name);
      photoUrl = getPhotoFolder_().createFile(blob).getUrl();
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var sheet = getSheet_();
      if (sheet.getLastRow() === 0) {
        sheet.appendRow(['Submitted'].concat(body.headers, ['Photo']));
        sheet.setFrozenRows(1);
        sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold');
      }
      sheet.appendRow([now].concat(body.row, [photoUrl]));
    } finally {
      lock.releaseLock();
    }
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  }
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    var first = ss.getSheets()[0];
    sheet = first.getLastRow() === 0 ? first.setName(SHEET_NAME) : ss.insertSheet(SHEET_NAME);
  }
  return sheet;
}

/** Photo folder sits next to the Sheet (i.e. in the Drive root if the Sheet is there). */
function getPhotoFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('PHOTO_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* deleted – recreate below */ }
  }
  var parents = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId()).getParents();
  var parent = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  var folder = parent.createFolder(PHOTO_FOLDER_NAME);
  props.setProperty('PHOTO_FOLDER_ID', folder.getId());
  return folder;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
