var require = patchRequire(require);
var settings = require('./settings.json');
var fs = require('fs');

/*********************BEGIN CASPER FUNCTION*************************/
var is_debug = false;
var is_capture = false;
var capture_order = 0;
var step_order = 0;

var c = require('casper').create({
	httpStatusHandlers: {
	    200: function(self, resource) {
	    	this.echoDbg('- 200 ' + resource.url + ' OK!');
	    },
	    301: function(self, resource) {
	      	this.echoDbg('- 301 ' + resource.url + ' moved Permanently', 'INFO_BAR');
	    },
	    302: function(self, resource) {
	      	this.echoDbg('- 302 ' + resource.url + ' moved Temporarily');
	    },
	    404: function(self, resource) {
	      	this.echoDbg('=> 404 ' + resource.url + ' not found', 'ERROR');
	    },
	    500: function(self, resource) {
	      	this.echoDbg('=> 500 ' + resource.url + ' gave an error', 'ERROR');
	    }
	},
	pageSettings: {
		loadImages:  settings.is_load_image,
		loadPlugins: false,
	    userAgent: settings.user_agent
	},
	viewportSize: {
		width: settings.view_port_width, 
		height: settings.view_port_height
	},
	waitTimeout: settings.wait_timeout,
	onWaitTimeout: function(){
		this.echoError('Wait timeout at step '+ step_order +' so casper stop now')
		.setResponseMessageError('SESSION '+this.getCurrentSession()+' wait time out at STEP ' + step_order)
		.stop();
	}
	//verbose: true,
    //logLevel: 'debug'
	//colorizerType: 'Dummy', //uncomment when running in window
});

/*********************BEGIN UTIL FUNCTION*************************/
/*
 * Check params available and not empty, if not, stop casper.
 * Input: 	chkParams (string or array)
 * Output: 	nothing
 */
c.checkParams = function(chkParams){
	if(typeof(chkParams) == 'undefined' || chkParams == ''|| chkParams.length == 0)
		return;
	var params = this.cli.options;
	if(typeof(chkParams) == 'string')
		chkParams = [chkParams];
	for(var i in chkParams)
	{
		var chkParam = chkParams[i];
		if(typeof(params[chkParam]) == 'undefined' || params[chkParam] == '')
		{
			this.echoError('Missing param ' + chkParam)
				.setResponseMessageError('Missing param ' + chkParam)
				.stop();
			return;
		}
	}
};

c.getCurrentSession = function(){
	if(typeof(this.current_session) == 'undefined')
	{
		var add_zero = function(a){10>a&&(a='0'+a);return a};
		var now = new Date();
		this.current_session = now.getFullYear()+''+add_zero(now.getMonth()+1)+add_zero(now.getDate())+'_'
		+add_zero(now.getHours())+add_zero(now.getMinutes())+add_zero(now.getSeconds())+'_'+now.getMilliseconds();
	}
	return this.current_session;
};

c.getCurrentDate = function(){
	if('undefined' === typeof(this.current_date))
	{
		var add_zero = function(a){10>a&&(a='0'+a);return a};
		var now = new Date();
		this.current_date = now.getFullYear()+''+add_zero(now.getMonth()+1)+add_zero(now.getDate());
	}
	return this.current_date;
};

c.caculateTimer = function(begin, end){
	var time_total = (end - begin);
	var time = '';
	if(time_total < 1000)
		time = time_total + 'ms';
	else{
		time_total = time_total/1000;
		var seconds = parseInt(time_total%60);
		var minutes = parseInt(time_total/60);
		if(minutes == 0) 
			time = seconds + 's';
		else
			time = minutes + 'm:' + seconds + 's';
	}
	return time;
};

/*********************END UTIL FUNCTION*************************/

c.res = {
	error: 0,
	data: {}
};

c.isStopped = false;
c.stepTimer = [];

c.time_begin = new Date();

c.on('remote.message', function(message) {
    this.echoDbg(message);
});
c.on('resource.received', function(resource){
	if(resource.stage == 'start')
		this.echoDbg('- ' + resource.status + ' ' + resource.url + ' ' + resource.bodySize + 'b');
});

c.setResponse = function(data, error_code){
	if(typeof(error_code) == 'undefined')
		error_code = 0;

	this.res = {
		error : error_code,
		data : data
	};
	return this;
};

c.getResponseCode = function(){
	return this.res.error;
};

c.addResponseData = function(value, data){
	this.res.data[value] = data;
	return this;
};

c.setResponseMessage = function(message){
	return this.setResponse({message: message});
};

c.setResponseMessageError = function(message){
	return this.setResponse({message: message}, 1);
};


c.operateBegin = function(text){
	this.time_operation_begin = new Date();
	step_order++;
	this.echoDbg('--' + this.time_operation_begin.toISOString() + '-- BEGIN STEP ' + step_order + ': ' + text, 'COMMENT');
};

c.operateFinish = function(){
	var time_operation_finish = new Date();
	var time = this.caculateTimer(this.time_operation_begin, time_operation_finish);
	this.echoDbg('--' + time_operation_finish.toISOString() + '-- FINISH STEP ' + step_order + ' in ' + time, 'COMMENT')
	.echoDbg('')
	.stepTimer.push(time);
};

c.operate = function(step_name, func){
	return this.then(function(){
		if(this.isStopped == true)
			return this;
        this.operateBegin(step_name);
        if(typeof(func) === 'function')
        	this.then(func);
	    this.then(function(){
	        this.captureDbg(step_name.split(' ').join('_'));
	        this.operateFinish();
	    });
    });
};

c.stop = function(){
	this.isStopped = true;
	return this;
};

c.optimizeJson = function(obj){
	var seen = [];
	return JSON.stringify(obj, function(key, val) {
	   if (typeof val == "object") {
	        if (seen.indexOf(val) >= 0)
	            return;
	        seen.push(val);
	    }
	    return val;
	}, 4);
};

c.echoDbg = function(object, type){
	this.addLog(object);
	if(is_debug == false)
		return this;
	
	if(typeof(object) != 'string')
		object = this.optimizeJson(object);
		
	if(typeof(type) == 'undefined')
		this.echo(object);
	else
		this.echo(object, type);
	return this;
};

c.echoError = function(object){
	return this.echoDbg('ERROR: ' + object, 'ERROR');
};

c.echoWarning = function(object){
	return this.echoDbg('WARNING: ' + object, 'WARNING');
};

c.echoSuccess = function(object){
	return this.echoDbg('SUCCESS: ' + object, 'INFO');
};

c.echoDbgLog = function (){
	if(settings.is_debug_log == false)
		return this;
	return this.echoFile(this.mlog, this.getCurrentDate()+'.txt');
};

c.echoFile = function(str, filename){
	if('undefined' === typeof(filename))
		filename = settings.folder_log+this.getCurrentSession()+'.txt';
	else
		filename = settings.folder_log+filename;
	fs.write(filename, str + '\r\n', 'a');
	return this;
}

c.addLog = function(object){
	if('undefined' == typeof(this.mlog))
		this.mlog = '';
	if (typeof(object) == 'string') 
		this.mlog += object + '\r\n';
	else
		this.mlog += this.optimizeJson(object);
	return this;
};

c.echoSummary = function(time){
	var type = 'SUCCESS';
	if(this.getResponseCode() == 1){
		type = 'ERROR';
		this.echoFile(this.mlog, 'error.txt');
	}
	var cron_id = (typeof this.cli.options.cron == 'undefined') ? 0 : this.cli.options.cron;
	this.echoFile(cron_id+','+type+','+this.getCurrentSession()+','+time+','+this.stepTimer.join(), this.getCurrentDate()+'.csv');
	return this;
}

c.captureDbg = function(filename){
	if(is_capture == false)
		return this;
	capture_order++;
	filename = settings.folder_capture + this.getCurrentSession() + '_' + capture_order + '_' + filename + '.jpg';
	this.capture(filename);
	return this;
};


/*********************END CASPER FUNCTION*************************/


/*********************BIGIN EXPORTS FUNCTION*************************/

exports.casper = c;

exports.run = function() {	
	if(c.cli.has('log') && (c.cli.get('log') == 'true' || c.cli.get('log') == '1'))
		is_debug = true;
	if(c.cli.has('capture') && (c.cli.get('capture') == 'true' || c.cli.get('capture') == '1'))
		is_capture = true;

	c.start().then(function(){
		if(this.cli.has('adblocks') && typeof(settings.adblocks[this.cli.get('adblocks')]) != 'undefined')
		{
			var adblocks = settings.adblocks[this.cli.get('adblocks')];
			this.page.onResourceRequested = function(data,request){
		  		for(var i in adblocks){
		  			if(data.url.indexOf(adblocks[i]) > -1)
		  			{
		  				request.abort();
		  				return;
		  			}
		  		}
			}
		}
		this.echoDbg('---------------------------------------------')
		.addResponseData('session_auto', this.getCurrentSession())
		.echoDbg('--' + this.time_begin.toISOString() + '-- START RUN ' + this.getCurrentSession() + '\r\n')
		.echoDbg('Params is ')
		.echoDbg(this.cli.options)
		.echoDbg('\r\n');
		runner(this.cli.options);
	});
    
	// Run and finish casper
	return c.run(function(){	
		var	time_finish = new Date();
		var time = this.caculateTimer(this.time_begin, time_finish);
		var res = JSON.stringify(this.res);
		this.echoDbg('Response is:')
		.echo(res)
		.addLog(res)
		.echoDbg('\r\n--' + time_finish.toISOString() + '-- FINISH RUN ' + this.getCurrentSession() + ' in ' + time)
		.echoDbg('---------------------------------------------')
		.echoDbgLog()
		.echoSummary(time)
		.exit();
	});
};

/*********************END EXPORTS FUNCTION*************************/