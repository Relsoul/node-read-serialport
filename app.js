const express = require('express');
const path=require("path");
const SerialPort = require('serialport');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const fs=require("fs");

server.listen(3050,function () {
    var host = server.address().address;
    var port = server.address().port;
    console.log('Example app listening at http://%s:%s', host, port);
});

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname,"./index.html"));
});


/**
 *  port control
 *
 */

// let port = new SerialPort('/dev/tty-usbserial1', {
//     baudRate: 15200
// });

// SerialPort.open(()=>{
//     console.log("监听端口成功")
// });

    let currentPort=null;

function portControl(io,socket) {

    SerialPort.list().then((list)=>{
        console.log('list',list);

        io.emit('get-port-done', { list:list});
    });
}

function portConnectPromise(port) {
    return new Promise((resolve,reject)=>{
        let c=port.on("open",(data)=>{
            console.log('connect port success');
            resolve(true)
        });

    });
}

//必须为hex 因为为hex为buffer的16进制
function portWritePromise(port,{data,encode='hex'}) {
    return new Promise((resolve,reject)=>{
        data=Buffer.from(data);
        port.write(data,encode,(data)=>{
            console.log('write port success');
            resolve(data)
        })
    });
}

function initPort() {

}


/**
 * socket.io control
 */

io.on('connection', async function (socket) {

    portControl(io,socket);


    socket.on('start-port', async function (data) {
       console.log('start new port',data);

        if(currentPort&&currentPort.close){
            currentPort.close();
            currentPort=null;
        }

       //初始化port
        currentPort= new SerialPort(data.port,{baudRate: 115200});
        let openMessage=await portConnectPromise(currentPort);

        io.emit('port-open', { data:"open"});

        //监听port数据
        let package=[];
        currentPort.on('data', function (data) {
            // console.log('Data:', data);
            package.push(data);

            //判断是否是图片的开始和结束
            let isPictureEnd=data.includes(0x03,-2)&&data.includes(0xfe,-3);

            //判断是否是取消命令的开始和结束
            let isCancel=data.includes(0xc3,-1)&&data.includes(0x03,-2);
            if(isPictureEnd){
                //拼接buffer
                let endPackage=Buffer.concat(package);
                let startIndex=endPackage.indexOf(0x42);

                //移除0x42之前的无用hex 和移除 0x03后的无用hex
                endPackage=endPackage.slice(startIndex,-2);//remove start

                // console.log('send img',endPackage);

                //转换为base64
                let base64Package=endPackage.toString('base64');
                let data=base64Package.toString();

                io.emit('send-data', { data:data,isImg:true});
                package=[];
            }else if(isCancel){
                let endPackage=Buffer.concat(package);
                console.warn("cancel");
                io.emit('send-data', { data:endPackage.toString("hex"),isImg:false});
            }
        });
    });

    socket.on('send-code',async function (res) {

        //16进制转换为10进制
        let codeArr=res.data.split(" ");
        for(let [key,val] of codeArr.entries()){
            val="0x"+val;
            codeArr[key]=Number.parseInt(val,16);
        }

        //向port发送数据
        let sendMessage=await portWritePromise(currentPort,{data:codeArr});
        console.log("sendMessage ",sendMessage);
    });

    socket.on('close-port',function () {
        if(currentPort&&currentPort.close){
            currentPort.close();
            currentPort=null;
        }

        io.emit("close-done")
    });

    socket.on('disconnect', function () {
        if(currentPort&&currentPort.close){
            currentPort.close();
            currentPort=null;
        }
    });

});
