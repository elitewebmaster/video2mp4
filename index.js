process.env["FFMPEG_PATH"] = process.env["LAMBDA_TASK_ROOT"] + "/ffmpeg/ffmpeg";
process.env["FFPROBE_PATH"] = process.env["LAMBDA_TASK_ROOT"] + "/ffmpeg/ffprobe";

var AWS = require('aws-sdk'),
    fs = require('fs'),
    somepath = require('path'),
    ffmpeg = require('fluent-ffmpeg');

ffmpeg.setFfmpegPath(process.env["FFMPEG_PATH"]);
ffmpeg.setFfprobePath(process.env["FFPROBE_PATH"]);

var s3 = new AWS.S3();

function s4() {
  return Math.floor((1 + Math.random()) * 0x10000)
    .toString(16)
    .substring(1);
}

function guid() {
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}

function plusToSpace(str){
  if(str.includes("+")){
    if(str.includes("/")){
      let arr = str.split("/");
      arr[arr.length - 1] = arr[arr.length - 1].trim().replace(/\+/g, " ");
      str = arr.join("/");
    } else {
      str = str.trim().replace(/\+/g, " ")
    }
  }
  return str;
}


function deleteFiles(localPath){
  fs.unlink(localPath, (err) => {
    if (err) throw err;
    console.log(localPath + ' was deleted');
  });
}

exports.handler = function(event, context, callback) {
    context.callbackWaitsForEmptyEventLoop = false;
    var url = plusToSpace(decodeURIComponent(event.filepath)), 
        thumbnailUrl = process.env.MAIN_FOLDER_NAME + url.slice(url.indexOf("/"), url.lastIndexOf("/") + 1), 
        nameOnly = url.slice(url.lastIndexOf("/") + 1, url.lastIndexOf(".")), 
        extension = ".mp4",
        uuidFilename = guid(), 
        bucket = process.env.S3_BUCKET_NAME, 
        localTempFolder = "/tmp", 
        filesList = localTempFolder + "/" + uuidFilename + extension,
        key = thumbnailUrl + nameOnly + extension;


    console.log("URL: " + url);
    console.log("Random File: " + uuidFilename);
    var filePath = somepath.join(localTempFolder, uuidFilename + (url.slice(url.lastIndexOf("."), url.length)));
    console.log("File path: " + filePath);
    var file = fs.createWriteStream(filePath, 'utf8');
    file.on('finish', function(){ 
        console.log("File Downloaded");

        ffmpeg(filePath)
                  .on('error', function(err) {
                      console.log('an error happened: ' + err.message);
                      callback(err);
                  })
                  .on('end', function() {
                      console.log('uploading ' + extension.slice(1));

                      var readStream = fs.createReadStream(filesList),
                          params = {
                            ACL: 'public-read',
                            Bucket: bucket,
                            Key: key,
                            Body: readStream,
                            ContentType: 'video/' + extension.slice(1)
                          };
                      
                      s3.upload(params, function(err, data) {
                        if (err) {
                            console.log(err);
                            callback(err);
                          //  return err;
                        } else {
                            console.log(data);
                        //    deleteFile(filesList);
                            deleteFiles(filePath);
                            deleteFiles(filesList);
                            callback(null, { ok: true, path: data.Key });
                        }
                      });

                  })
                  .save(filesList);
    });
    
    file.on('error', function(e){ 
        console.log("Error downloading file", e);
        callback(e);
    });
    s3.getObject({ Bucket: bucket, Key: url }).createReadStream().pipe(file, { end: true });

}




