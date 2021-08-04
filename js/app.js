// Initialize Firebase
firebase.initializeApp(Config);
const db = firebase.firestore();

firebase.auth().onAuthStateChanged(async function(user) {
if (!user || user.emailVerified == false)
sign_out_user();    

else 
{
  await set_user_auth();

  // Update welcome instruction
  document.getElementById("welcome_instruction").innerText = "Tap anywhere to begin";

  logo_div.onclick = async function(){  await set_navigation_section_display();}

  var is_subscribed = 0;

  if(gl_user_permission.admin == 1)            // Subscribe to alerts if user is admin or has permission to receive any operation disruption alerts
  {
    is_subscribed = 1;
  }
  else
  {
    const user_permission_keys = Object.keys(gl_user_permission);
    for(var i=0; i<user_permission_keys.length; i++)
    {
      if(user_permission_keys[i].substr(user_permission_keys[i].length-3) == "_an") is_subscribed = 1;
    }
  }

  if(is_subscribed)
  await subscribe_alert_notifications();

}
});       


var functions = firebase.app().functions('asia-east2');

var current_user_profile;
var current_user_token;


// Global vars
const max_qc_stages = 15;
const max_qc_stage_parameters = 20;
const max_maintenance_stage_parameters = 15;
const param_name_max_length = 100; // max length of parameters & operation titles
const param_value_max_length = 50;
const url_max_length = 160;
const max_production_operations = 25;
const max_workstations_per_operation = 20;
const max_serial_number_length = 50;
const max_email_length = 100;
const max_password_length = 100;
const remark_max_length = 250;

const gl_image_scale_factor = 0.7; // Size to scale QR label

const gl_max_credit_usage_log_months = 3;
const gl_max_credit_logs_per_doc = 5000;
const gl_credit_validity_max_years = 1;    // max years  credit purchased is valid from date of purchase
const milli_sec_per_year = 365 * 24 * 60 * 60 * 1000; //milli seconds per year‬

// Set max lengths of fields
document.getElementById("serial_number_update_section").maxLength = max_serial_number_length;
document.getElementById("serial_number_create_section").maxLength = max_serial_number_length;
document.getElementById("email_user_permission_section").maxLength = max_email_length;
document.getElementById("password_user_permission_section").maxLength = max_password_length;
document.getElementById("from_serial_download_job_records_section").maxLength = max_serial_number_length;
document.getElementById("to_serial_download_job_records_section").maxLength = max_serial_number_length;


//0: completed, 1: all ok/in progress, 2: minor deviation required before completion, 
// 3: major deviation required, 4: rejected. Value is max value of all sub - statuses in operations
const status_list = ["Completed", "Minor Deviation Present", "In Progress", "Major Deviation Present", "Rejected"];
const status_list_color = [" text-success", " text-danger"," text-primary", " text-danger", "text-danger"];

const data_types = ["Numeric Range", "Option List", "Sub-Job", "Free Response"];
const parameter_criticality_level = ["Minor", "Major"];
const section_permission_list =
                     { 
                      ["Configure System Settings"] : "sp_system_settings",
                      ["Configure Users"] : "sp_user_perm",                        
                      ["View Dashboard"] : "sp_dashboard", 
                      ["Add New Job"] : "sp_create_serial", 
                      ["Report Process Disruptions"] : "sp_process_disruptions",
                      ["Update Maintenance Records"] : "sp_maintenance"
                     };

const permission_list_no_yes = ["No", "Yes"];
const permission_list_access = ["None", "Read", "Write", "Update"];     

const indexcolors = [
                      '#80b1d3',  '#b3de69',  '#e6194B', 	'#bebada', 	'#ffed6f', 	'#ffd8b1', 	'#4363d8', 	'#fccde5', 	'#d9d9d9',  '#f58231', 	
                      '#bc80bd', 	'#ccebc5', 	'#42d4f4', 	'#8dd3c7', 	'#ffffb3', 	'#800000', 	'#9A6324', 	'#808000', 	'#f032e6', 	'#000000'
                    ];

  const pending_jobs_charts_list = ["realtime_pending_jobs_default","realtime_pending_jobs_model","realtime_pending_jobs_status"];

  const completed_jobs_charts_list = ["realtime_completed_jobs_default","realtime_completed_jobs_model",
                                  "realtime_completed_jobs_workstation","realtime_completed_jobs_status","realtime_completed_jobs_user"];


const disruption_reasons = ["Machinery Breakdown", "No Parts Available", "Incorrect Parts", "Bad Quality Parts", "No Manpower", "Power Failure", "Other"];

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun","Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// set on auth state change via firebase
var gl_curr_user_details = {};
var gl_user_permission = {};                            // read permissions on page load
var company_id;                                    // company_id of user for database access

var gl_current_operations_list = [];               //global variables read from database
var gl_model_list = [];
var gl_user_list = [];                                                            // list of all users
var gl_curr_record ={};
var gl_curr_process_plan = {};
var gl_curr_maintenance_plan = {};
var gl_credits_obj = {};
var gl_maintenance_updates_list = {};             // global variable that holds details of scheduled maintenance for all workstations

var gl_disruption_alerts;                         // global variable holding disruption alerts
var gl_disruption_alerts_is_subscribed = false;   // global variable indicating if disruption alert is already subscribed

var curr_rec = {};

var gl_maintenance_plan_list = {};

var gl_analytics_operation_name = "";       // global variable - holds fetched operation name
var gl_analytics_records_list = [];         // global variable - Holds fetched Job Data for analytics
var gl_analytics_disruption_records_list = []; // global variable - holds fetched Disruption Report Data for analytics
var gl_anlytics_maintenance_records_list = []; // global variable - holds fetched Maintenance Records Data for analytics

var gl_pending_multi_serial_number_create_list = [];      // global variable - holds list of pending serial numbers to be generated

//CACHE to store values for sampling or frequency based QC parameters
// key format = "model.operation.param_name"
//value format => value: "<value", record_time: "<Start Date>", freq_remaining: "<freq_count>"
var gl_parameter_cache = {};
const gl_parameter_cache_expiry_hours = 5;  //parameter values expire after these many hourse

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                General Functions                                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////     


// Function to update items when alert notification is changed
async function alert_notification_update(updated_alert)
{
  var alerts_container =  document.getElementById("alerts_container");
  var sorted_disruption_list = updated_alert;

  // initialize if gl_alert is empty during first load
  if(gl_disruption_alerts == undefined) gl_disruption_alerts = [];

  sorted_disruption_list.sort(function(a,b){return (a["start_time"] - b["start_time"]) } );         // sort list as per date
  updated_alert = sorted_disruption_list;


  if(updated_alert.length - gl_disruption_alerts.length == 1)     // create alert notification for new disruption
  {
    var new_alert = updated_alert[updated_alert.length-1];
    var alert = document.createElement('div');
    alert.className = "alert alert-danger alert-dismissible text-break";
    alert.innerHTML = '  <button type="button" class="close" data-dismiss="alert">&times;</button><strong>' + 
    new_alert.reason + '</strong> in <strong>' + new_alert.operation + ' (' + new_alert.workstation + ')</strong>.<br>Reported by ' + new_alert.start_user;

    if(!is_null(new_alert.remark))
      alert.innerHTML += "<br>Remark: " + new_alert.remark;

    if(gl_user_permission.admin == 1 || gl_user_permission[new_alert.operation + "_an"] == 1 && (new Date() - new Date(new_alert["start_time"]) < 30000 ) )
    alerts_container.appendChild(alert); 
  }

  else if(updated_alert.length > gl_disruption_alerts.length)        // create combined alert notification for existing process disruptions
  {
    var tot_active_disruptions_readable =0;                                       // count of active disruptions that user has permission to read / access
    for(var i=0; i<updated_alert.length; i++)
    {
      if(gl_user_permission.admin == 1 || gl_user_permission[updated_alert[i].operation + "_an"] == 1 )
      tot_active_disruptions_readable+=1;
    }

    var alert = document.createElement('div');
    alert.className = "alert alert-warning alert-dismissible";
    alert.innerHTML = '<button type="button" class="close ml-n2" data-dismiss="alert">&times;</button><strong>Alert!</strong> ' + tot_active_disruptions_readable
     + ' Process Disruption(s) currently active';
    if( tot_active_disruptions_readable > 0 )
    alerts_container.appendChild(alert); 
  }

  // update gl_disruption_alerts
  gl_disruption_alerts = updated_alert;

  await initialize_process_disruption_section();      // update display
  return true;
}


// Function to check if variable is null , empty, undefined, false, etc
function is_null(parameter, additional_exclusion_list = [])
{
  if (additional_exclusion_list.indexOf(parameter) >=0 )
  return true;

  if ( typeof(parameter) == "string" && parameter != "")
  return false;

  else if (parameter == "" || (isObject(parameter) && JSON.stringify(parameter).length<=2 && (Object.keys(parameter)).length == 0 && parameter.childElementCount == undefined ) || parameter == undefined || parameter == false || parameter == []) 
  return true;
  
  else return false;
}


// Support function for compare_objects. Checks if someting is an object
function isObject(object) 
{
return object != null && typeof object === 'object';
}


// Function to compare 2 objects
function compare_objects(object1, object2) 
{
  if(!isObject(object1) || !isObject(object2) )
  return false;

const keys1 = Object.keys(object1);
const keys2 = Object.keys(object2);

if (keys1.length !== keys2.length) {
return false;
}

for (const key of keys1)
 {
  const val1 = object1[key];
  const val2 = object2[key];
  const areObjects = isObject(val1) && isObject(val2);
  if (areObjects && !compare_objects(val1, val2) || !areObjects && val1 !== val2) { return false;}
 }

return true;
} 


// Function to remove a value from an array
function remove_string_from_array(array_list, value_to_be_removed)       // remove user from global user list
{
var new_array = [];
for(var i=0; i<array_list.length; i++)
{
if(array_list[i] != value_to_be_removed)
new_array.push (array_list[i]);
}
return new_array;
}



//Function to validate an email      
function validate_email(email) 
{
const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
return re.test(String(email).toLowerCase());
}

//Function to display navigation sections as per user permission
function set_navigation_section_display()
{
  if(gl_user_permission.admin == 1 || gl_user_permission.sp_dashboard == 1)
  document.getElementById("navigation_dashboard_btn").style = "display : block";

  if(gl_user_permission.admin == 1 || gl_user_permission.sp_create_serial == 1)
  document.getElementById("navigation_create_serial_btn").style = "display : block";  

  if(gl_user_permission.admin == 1 || gl_user_permission["Basic Info"] >= 1)
  document.getElementById("navigation_update_serial_btn").style = "display : block";  

  if(gl_user_permission.admin == 1 || gl_user_permission.sp_process_disruptions == 1)
  document.getElementById("navigation_process_disruptions_btn").style = "display : block";       

  if(gl_user_permission.admin == 1 || gl_user_permission.sp_maintenance == 1)
  document.getElementById("navigation_maintenance_updates_btn").style = "display : block";     

  if(gl_user_permission.admin == 1 || gl_user_permission.sp_user_perm == 1 ||  gl_user_permission.sp_system_settings == 1 )
  document.getElementById("navigation_configure_settings_btn").style = "display : block";  

      if(gl_user_permission.admin == 1 || gl_user_permission.sp_user_perm == 1)
      {
        document.getElementById("navigation_user_permission_btn").style = "display : block";  
      }

      if(gl_user_permission.admin == 1 || gl_user_permission.sp_system_settings == 1)
      {
        document.getElementById("navigation_model_qc_plans_btn").style = "display : block";  
        document.getElementById("navigation_configure_production_operations_btn").style = "display : block";    
        document.getElementById("navigation_configure_notifications_btn").style = "display : block";  
        document.getElementById("navigation_configure_maintenance_schedule_btn").style = "display : block";  
      }

  if(gl_user_permission.admin == 1 || gl_user_permission.sp_create_serial == 1 || gl_user_permission.sp_dashboard == 1)
  document.getElementById("navigation_view_credits_btn").style = "display : block";  

  document.getElementById("logout_btn").style = "display : block"; 
  
  document.getElementById("navigation_company_name").innerHTML = "<small>" + gl_curr_user_details.company + "</small>";
  document.getElementById("navigation_current_user").innerHTML = "<small class='text-break'>(" + gl_curr_user_details.email + ")</small>";

  document.getElementById("logo_div").style = "display : none";
  document.getElementById("main_div").style = "display : block";

}

//Function to hide all divs / sections except mentioned div for navigation
function navigation_helper(current_section)
{
var nav_section_list = document.getElementsByName("nav_section");
for(var x of nav_section_list)
{document.getElementById(x.id).style.display = "none";}

// whether to show main menu button or not
if(current_section == "navigation_menu")  document.getElementById("navigation_menu_btn").style.display = "none";
else document.getElementById("navigation_menu_btn").style.display = "block";

// top button nav for sub-sections of dashboard_section
if(current_section == "navigation_download_job_records" || current_section == "navigation_daily_operation_analytics" || current_section == "navigation_hourly_operation_analytics"
  || current_section == "navigation_realtime_analytics" || current_section == "navigation_operation_pending_jobs" || current_section == "navigation_deviation_required_jobs"
  || current_section == "navigation_process_disruption_analytics" || current_section == "navigation_maintenance_history_analytics"
  || current_section == "navigation_wip_inventory_analytics")  
{
  document.getElementById("navigation_menu_btn").style.display = "none";
  document.getElementById("back_dashboard_menu_btn").style.display = "block";
}
else  document.getElementById("back_dashboard_menu_btn").style.display = "none";


// top button nav for sub-sections of configure_settings_section
if(current_section == "navigation_user_permission" || current_section == "navigation_model_qc_plans" 
|| current_section == "navigation_configure_production_operations" || current_section == "navigation_configure_maintenance_schedule"
|| current_section == "navigation_configure_notifications")  
{
  document.getElementById("navigation_menu_btn").style.display = "none";
  document.getElementById("back_configure_settings_menu_btn").style.display = "block";
}
else  document.getElementById("back_configure_settings_menu_btn").style.display = "none";

document.getElementById(current_section).style.display = "block";

return true;
}


//Function to decode timestamp to local date time string or date object depending on mode
function decode_date(timestamp, mode = 0)
{
  if(is_null(timestamp)) return "";

  var decoded_date;

  // Timestamp processed by server
  if(!is_null(timestamp.seconds) && (!is_null(timestamp.nanoseconds) || timestamp.nanoseconds == 0 ) )
  decoded_date = new firebase.firestore.Timestamp(timestamp.seconds,timestamp.nanoseconds).toDate();
  // Timestamp not fully processes by server
  else if(!is_null(timestamp._seconds) && (!is_null(timestamp._nanoseconds) || timestamp._nanoseconds==0 ) )
  decoded_date = new firebase.firestore.Timestamp(timestamp._seconds,timestamp._nanoseconds).toDate();
  // Local Timestamp
  else
  decoded_date = new Date(timestamp); 

  if(mode == 1)
  return decoded_date;

  // return date in format 1-Nov-2020
  if(mode == 2)
  {
    var date_string = decoded_date.getDate() + "-" + monthNames[decoded_date.getMonth()].substr(0,3) + "-" + decoded_date.getFullYear();
    return date_string;
  }

  var date_string = decoded_date.toDateString() + ", " + decoded_date.toLocaleTimeString();
  return date_string;
}

// Support Function to display elapsed time counter for active process disruptions, andon, etc
function display_elapsed_time(start_date, display_field_container)
{
  var curr_date = new Date();
  var time_diff = Math.abs(curr_date - start_date)/1000;
  
  min = Math.floor(time_diff / 60);
  time_diff -= min * 60;
  
  sec = Math.floor(time_diff % 60); 
  
  display_field_container.innerHTML ="<small><b>" + min + " min(s) " + sec + " sec(s)" + "</b></small>";
}

// Function to display an error Modal with message
async function display_error(error_message)
{
await dismiss_all_modals();  
document.getElementById("error_modal_message").innerHTML = error_message;
$("#errorModal").modal();    
}

// Function to display an info Modal with message
async function display_info(info_message)
{
await dismiss_all_modals();
document.getElementById("info_modal_message").innerHTML = info_message;
$("#infoModal").modal();    
}

// Function to display an info Modal (no bitton to dismiss) with message
async function display_info_no_dismiss(info_message)
{
await dismiss_all_modals();
document.getElementById("info_modal_no_dismiss_message").innerHTML = info_message;
$("#infoModal_no_dismiss").modal();    
}

// Function to display a help Modal with message
async function display_help(help_message)
{
await dismiss_all_modals();  
document.getElementById("help_modal_message").innerHTML = help_message;
$("#helpModal").modal();    
}


//Function to display confirmation Modal with message
async function display_confirmation(confirmation_message, onsuccess_fn, param1="", param2="", param3 = "", param4 = "", param5 = "")
{
await dismiss_all_modals();  
document.getElementById("confirmation_modal_message").innerHTML = "<div class='text-break'>" + confirmation_message + "</div>";
yes_confirmation_modal_btn.onclick = async function(){await onsuccess_fn(param1,param2,param3,param4,param5); };

$("#confirmationModal").modal();         
}

// Function to create a modal to copy template for existing process plan
async function display_process_plan_template_selection_modal(current_model, model_list)
{
  await dismiss_all_modals();

  new_process_plan_template_select_container = document.getElementById("new_process_plan_template_select");
  empty_container_byReference(new_process_plan_template_select_container);

  var model_template_select_list = ["Start New"];

  // Populate model types except select current model
  for(var i=0; i<model_list.length; i++)
  {
    if(model_list[i]!= current_model)
    {
      model_template_select_list.push(model_list[i]);
    }
  }

  set_select_options(new_process_plan_template_select_container, model_template_select_list);

  $("#process_plan_template_select_Modal").modal();         


  process_plan_template_select_btn.onclick = async function(){

    var temp_process_plan = {};

    if(new_process_plan_template_select_container.value != "Start New")
    temp_process_plan = await read_qc_plan(new_process_plan_template_select_container.value);

    await await_loading(populate_process,temp_process_plan);

  }


}


// Support function to generate array containing all integers between min & max value given. Used in Tables & others
function generate_min_max_array(min_value, max_value)
{
  var temp_array = [];
  for(var i= min_value; i <= max_value; i++)
  temp_array.push(i);

  return temp_array;
} 

//Function to validate input field
function validate_input(input_field)
{
if(input_field == "") 
  {
    display_error("Please fill out empty fields to continue.");
    return false;
  } 
  else return true;
}

// Function to validate serial number field
function validate_serial_number(serial_number)
{
  if(serial_number == "") 
  {
    display_error("Please enter serial number to continue.");
    return false;
  } 
  if(serial_number.indexOf("/") >= 0)
  {
    display_error("Serial Number cannot contain ' / ' (forward-slash)");
    return false;
  }

  else return true;
}

//Function to empty all elements in container
function empty_container(element_id)
{
let container = document.getElementById(element_id);
while(container.childElementCount) container.removeChild(container.lastChild);
return true;
}

//Function to empty all elements in container
function empty_container_byReference(container)
{
while(container.childElementCount) container.removeChild(container.lastChild);
return true;
}


async function resize_canvas(img,scale_factor)
{
  var canvas = document.createElement("canvas");
  canvas.width = img.width*scale_factor;
  canvas.height = img.height * scale_factor;

  var width = img.width * scale_factor;
  var height = img.height * scale_factor;

  var ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);

  return canvas;
}

//Function to reset sections
async function reset_sections()
{
//reset dashboard section
gl_analytics_operation_name = "";       
gl_analytics_records_list = [];         
gl_analytics_disruption_records_list = [];
gl_anlytics_maintenance_records_list = [];

  // reset deviation required jobs section - sub section of dashboard
  empty_container("deviation_required_jobs_table_container");

  // reset download job records - sub section of dashboard
  document.getElementById("from_serial_download_job_records_section").value = "";
  document.getElementById("to_serial_download_job_records_section").value = "";
  await empty_container("download_job_records_table_container");

//reset create serial number section
gl_pending_multi_serial_number_create_list = [];
document.getElementById("reset_create_serial_btn").click(); // Simulate click to reset section
document.getElementById("serial_number_create_section").value = "";
document.getElementById("serial_number_delete_section").value = "";

//reset update serial number record section
await empty_container("serial_qc_data_display");
await empty_container("qc_stage_select_list");
gl_curr_record = {};

document.getElementById("serial_number_update_section").value = "";
//      document.getElementById("reScan_btn").click(); // Simulate click to reset scanner
document.getElementById("navigation_update_serial_1").style.display = "flex";
document.getElementById("navigation_update_serial_2").style.display = "none";

//reset current maintenance plan - for disruption report section & maintenance update section
gl_curr_maintenance_plan = {};

//reset Create QC Plan section
await empty_container("create_qc_plan_dynamic");

//reset configure production operations section
empty_container("production_operation_list_dynamic");

//reset User Permission section
document.getElementById("email_user_permission_section").value = "";
document.getElementById("password_user_permission_section").value = "";
await empty_container("create_user_permission_static");
await empty_container("create_user_permission_basic_info");
await empty_container("create_user_permission_dynamic");

//reset View Credits section
gl_credits_obj = {};
empty_container("credit_balance");

}


//Function to populate select list option
function set_select_options(container, options_array)
{
for (var i=0; i<options_array.length; i++)
{
let option = document.createElement("option"); 
option.value = options_array[i];
option.innerText = options_array[i];
container.appendChild(option);
}
}


//Function to display loading modal

// FLAG - start_loading_ver
var flag_start_loading_ver;              // Flag to track execution version
const gl_loading_dismiss_time = 12; // 12 seconds before loading dismiss message appears if taking too long
function start_loading()
{
  flag_start_loading_ver = new Date;
  flag_start_loading_ver.setSeconds(flag_start_loading_ver.getSeconds() + gl_loading_dismiss_time - 1);

  document.getElementById("loading_modal_footer").style.display = "none";
  $("#loadingModal").modal();

  // Show dismiss message & button if current time greater than (last function runtime + loading dismiss time) calculated
  setTimeout(function() {if(new Date >= flag_start_loading_ver) document.getElementById("loading_modal_footer").style.display = "block"}, gl_loading_dismiss_time*1000);

}

//Function to stop loading modal
function stop_loading()
{
  $("#loadingModal").modal("hide");
}

//Function to dismiss / closs all modals
async function dismiss_all_modals()
{
  await $('.modal').modal('hide');
  return true;
}


// Function to copy disruption record object
function copy_disruption_record(old_record)
{
  var new_record = [];
  var temp_disruptions = [];
  for(var i=0; i<old_record.length; i++)
  {
    var temp_disruption_obj = {
                                ["id"] : old_record[i].id,
                                ["operation"] : old_record[i].operation,
                                ["workstation"] :old_record[i].workstation, 
                                ["reason"] : old_record[i].reason,
                                ["remark"] : old_record[i].remark,
                                ["start_user"] : old_record[i].start_user,
                                ["start_time"] : new Date(old_record[i].start_time)
                              };
    temp_disruptions.push(temp_disruption_obj);
  }

  new_record = temp_disruptions;

  return new_record;
}

// Function to copy a Job Record by value
function copy_record(record)
{
  var new_record = JSON.parse(JSON.stringify(record));       // record state after changes are made

  var operation_list = Object.keys(record);

  for(var i=0; i<operation_list.length; i++)
  {

    if( !is_null(record[operation_list[i]].log.entry_by) )
    try { new_record[operation_list[i]].log.entry_dt = record[operation_list[i]].log.entry_dt.toDate(); }
    catch(e) { new_record[operation_list[i]].log.entry_dt = record[operation_list[i]].log.entry_dt; }

    if( !is_null(record[operation_list[i]].log.update_by) )
    try { new_record[operation_list[i]].log.update_dt = record[operation_list[i]].log.update_dt.toDate(); }
    catch(e) { new_record[operation_list[i]].log.update_dt = record[operation_list[i]].log.update_dt; }

    if( !is_null(record[operation_list[i]].log.deviation_by) )
    try { new_record[operation_list[i]].log.deviation_dt = record[operation_list[i]].log.deviation_dt.toDate(); }
    catch(e) { new_record[operation_list[i]].log.deviation_dt = record[operation_list[i]].log.deviation_dt; }

  }

  return new_record;
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                 Log Out User Section                                               //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// 

// Function to sign out user
async function sign_out_user() 
{ 
await firebase.auth().signOut(); 
window.location.href = "index.html";
}

// Function to read custom claim tokens of a user
async function set_user_auth()
{
try
{        
current_user_profile =  firebase.auth().currentUser;
var token =  await current_user_profile.getIdTokenResult();
var claims = token.claims;                            // get claims stored in token
current_user_token = claims;

if(is_null(claims.company_id) ) console.log(claims);

gl_curr_user_details.name = current_user_profile.displayName;
gl_curr_user_details.email = current_user_profile.email;
gl_curr_user_details.company = current_user_token.company; 
gl_curr_user_details.company_id = current_user_token.company_id;
company_id = current_user_token.company_id;

if(claims.admin == 1)
  gl_user_permission = {admin : 1}
else
{
  gl_user_permission = await read_user_permission();
  gl_user_permission.admin = 0;
}
return true;
}
catch(error)
{
sign_out_user();
}
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                QR Code Scanner Functions                                           //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// 

// Global variables to support QR code scanning
var qrcode_scanner = window.qrcode;

const video = document.createElement("video");
const canvasElement = document.getElementById("qr-canvas");
const canvas = canvasElement.getContext("2d");

var outputData;           // field ref where final result is to added
let scanning = false;     // controls if scanning is on or off

// Scanning support function that renders video image each fram & tries to decode QR code
function tick() {
canvasElement.width = Math.min(window.innerWidth*0.8, 300);
canvasElement.height = video.videoHeight/video.videoWidth * canvasElement.width;
canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
scanning && requestAnimationFrame(tick);
}

// Scanning support function that tries to decode a QR code
function scan() 
{
try { qrcode_scanner.decode(); } 
catch (e) { setTimeout(scan, 300); }
}


// Function to stop scanning when stop_scan_btn in scanModal modal is pressed
stop_scan_btn.onclick = function () 
{
scanning = false;
video.srcObject.getTracks().forEach((track) => {
track.stop();
});

};

// On successful QR code scan - run this
qrcode_scanner.callback = (res) => 
{
if (res) {
outputData.value = res;                         // Set field value to result
outputData.dispatchEvent(new Event('change', { 'bubbles': true }));       // trigger field onchange for field validation

scanning = false;  
video.srcObject.getTracks().forEach((track) => {
track.stop();
});
stop_scan_btn.click();
}
};



// Function to open a Popup QR code scanner & save result in given field
async function popup_scanner(result_field_reference)
{
try
{
outputData = result_field_reference;                              // set outputDara to result_field - field where final QR code decoded value is to be added

// facing mode - environment : back camera, user : front camera
let stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }); 

{
  scanning = true;
  video.setAttribute("playsinline", true); // required to tell iOS safari we don't want fullscreen
  video.srcObject = stream;
  video.play();
  tick();
  scan();
  await $("#scanModal").modal();                                // Open scanModal

}
return true;
}
catch(error)
{
await display_error("Failed to access camera.<br/><br/>Please ensure camera access permission for your current browser is granted in your device settings & refresh to try again.")
return false;
}
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                Display Dashboard                                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////     

//Function to compare active serial number object - use in sorting
function compare_active(a, b)
{
// Use toUpperCase() to ignore character casing
const daysA = a.days;
const daysB = b.days;

let comparison = 0;
if (daysA < daysB) {
comparison = 1;
} else if (daysA > daysB) {
comparison = -1;
}
return comparison;
}  

//Function to display dashboard  
function initialize_dashboard()
{
if(true) return false; // [TODO]

}


// Function to render table with complete record data - Used in download job records & realtime analytics & daily / hourly operation analytics & others
function render_table_job_records(record_array, table_id, selected_operation_list = [])
{
  var operation_names = [];
  var operation_parameters_obj = {};

  // If selected_operation_list is provided, use only those operations for table
  if(!is_null(selected_operation_list) )
  {
    operation_names = selected_operation_list;
  }
  else
  {
    // Else get all operation names across all records
    for(var i=0; i<record_array.length; i++)
    {
      var operation_keys = Object.keys(record_array[i]);
      operation_names = operation_names.concat(operation_keys);
      operation_names = Array.from(new Set(operation_names));
    }
  }


  // remove "Basic Info" & other operations where user does not have atleast "read" permission (1 - read, 2 - write, etc) from operation_names array
  var temp_array = [];
  for(var i=0; i< operation_names.length; i++)
  {
    if(operation_names[i] != "Basic Info")
    {
      if(gl_user_permission.admin == 1 || gl_user_permission[operation_names[i]] >=1)
      temp_array.push(operation_names[i]);
    }
  }
  operation_names = temp_array;

  for(var i=0; i<operation_names.length; i++)
  {
    operation_parameters_obj[operation_names[i]] = [];

    // Get all parameters of an operation across all records
    for(var j=0; j< record_array.length; j++)
    {
      // concat parameter if operation exists else concat []
      if(record_array[j][operation_names[i]])
      operation_parameters_obj[operation_names[i]] = operation_parameters_obj[operation_names[i]].concat(Object.keys(record_array[j][operation_names[i]].actual_value) || []);

      operation_parameters_obj[operation_names[i]] = Array.from(new Set(operation_parameters_obj[operation_names[i]]));
    }   
  }
 
  // create table
  let table = document.getElementById(table_id);

  let table_header = document.createElement("thead");
  let header_row = document.createElement("tr");


  let th_model = document.createElement("th");
  th_model.innerText = "Model"; 
  header_row.appendChild(th_model);

  let th_serial = document.createElement("th");
  th_serial.innerText = "Serial ID"; 
  header_row.appendChild(th_serial);

  // items to be shown in "Basic Info" column group heading
  let th_external_id = document.createElement("th");
  th_external_id.innerText = "External ID"; 
  header_row.appendChild(th_external_id);

  let th_status = document.createElement("th");
  th_status.innerText = "Status"; 
  header_row.appendChild(th_status);

  let th_log_entry_dt = document.createElement("th");
  th_log_entry_dt.innerText = "Entry Date"; 
  header_row.appendChild(th_log_entry_dt);

  let th_log_entry_by = document.createElement("th");
  th_log_entry_by.innerText = "Entry By"; 
  header_row.appendChild(th_log_entry_by);

  let th_log_update_dt = document.createElement("th");
  th_log_update_dt.innerText = "Update Date"; 
  header_row.appendChild(th_log_update_dt);

  let th_log_update_by = document.createElement("th");
  th_log_update_by.innerText = "Update By"; 
  header_row.appendChild(th_log_update_by);


  // items to be shown in each Operation column group heading
  for(var i=0; i<operation_names.length; i++)
  {
    let th_op_status = document.createElement("th");
    th_op_status.innerText = "Status (" + operation_names[i] + ")"; 
    header_row.appendChild(th_op_status);
  
    let th_op_workstation = document.createElement("th");
    th_op_workstation.innerText = "Workstation ID (" + operation_names[i] + ")"; 
    header_row.appendChild(th_op_workstation);
  
     var param_name_list = operation_parameters_obj[operation_names[i]];
    for(var j=0; j< param_name_list.length; j++)
    {
      let th_op_param = document.createElement("th");
      th_op_param.innerText = param_name_list[j] + " (" + operation_names[i] + ")"; 
      header_row.appendChild(th_op_param);
    }

    let th_op_log_entry_dt = document.createElement("th");
    th_op_log_entry_dt.innerText = "Entry Date (" + operation_names[i] + ")"; 
    header_row.appendChild(th_op_log_entry_dt);
  
    let th_op_log_entry_by = document.createElement("th");
    th_op_log_entry_by.innerText = "Entry By (" + operation_names[i] + ")"; 
    header_row.appendChild(th_op_log_entry_by);
  
    let th_op_log_update_dt = document.createElement("th");
    th_op_log_update_dt.innerText = "Update Date (" + operation_names[i] + ")"; 
    header_row.appendChild(th_op_log_update_dt);
  
    let th_op_log_update_by = document.createElement("th");
    th_op_log_update_by.innerText = "Update By (" + operation_names[i] + ")"; 
    header_row.appendChild(th_op_log_update_by);

    let th_op_log_deviation_dt = document.createElement("th");
    th_op_log_deviation_dt.innerText = "Deviation Date (" + operation_names[i] + ")"; 
    header_row.appendChild(th_op_log_deviation_dt);
  
    let th_op_log_deviation_by = document.createElement("th");
    th_op_log_deviation_by.innerText = "Deviation By (" + operation_names[i] + ")"; 
    header_row.appendChild(th_op_log_deviation_by);    

    let th_op_log_remark = document.createElement("th");
    th_op_log_remark.innerText = "Remark (" + operation_names[i] + ")"; 
    header_row.appendChild(th_op_log_remark);        

  }

  table_header.appendChild(header_row);
  // End of table header generation section

  let table_body = document.createElement("tbody");
  table_body.className = "text-break";

  // Add values for each row
  for(var i=0; i<record_array.length; i++)
  {
    let body_row = document.createElement("tr");

    let td_model = document.createElement("td");
    td_model.innerText = record_array[i]["Basic Info"].model; 
    body_row.appendChild(td_model);
  
    let td_serial = document.createElement("td");
    td_serial.innerText = record_array[i]["Basic Info"].serial; 
    body_row.appendChild(td_serial);
  
    // items to be shown in "Basic Info" column group values
    
    let td_external_id = document.createElement("td");
    td_external_id.innerText = record_array[i]["Basic Info"].external_id; 
    body_row.appendChild(td_external_id);

    let td_status = document.createElement("td");
    td_status.innerText = status_list[record_array[i]["Basic Info"].status] || "-"; 
    if(td_status.innerText == status_list[0] && record_array[i]["Basic Info"].log.entry_by == "")
    td_status.innerText = "Ready for Dispatch";
    else if(td_status.innerText == status_list[0] && record_array[i]["Basic Info"].log.entry_by != "")
    td_status.innerText = "Dispatched";


    body_row.appendChild(td_status);
 
    let td_log_entry_dt = document.createElement("td");
    td_log_entry_dt.innerText = decode_date(record_array[i]["Basic Info"].log.entry_dt) || "-"; 
    body_row.appendChild(td_log_entry_dt);

    let td_log_entry_by = document.createElement("td");
    td_log_entry_by.innerText = record_array[i]["Basic Info"].log.entry_by || "-"; 
    body_row.appendChild(td_log_entry_by);
 
    let td_log_update_dt = document.createElement("td");
    td_log_update_dt.innerText = decode_date(record_array[i]["Basic Info"].log.update_dt) || "-"; 
    body_row.appendChild(td_log_update_dt);

    let td_log_update_by = document.createElement("td");
    td_log_update_by.innerText = record_array[i]["Basic Info"].log.update_by || "-"; 
    body_row.appendChild(td_log_update_by);
    

    for(j=0; j<operation_names.length; j++)
    {
      let td_op_status = document.createElement("td");
      if(record_array[i][operation_names[j]])
      td_op_status.innerText = status_list[record_array[i][operation_names[j]].status] || "-"; 
      else
      td_op_status.innerText = "n/a";
      body_row.appendChild(td_op_status);
    
      let td_op_workstation = document.createElement("td");
      if(record_array[i][operation_names[j]])
      td_op_workstation.innerText = record_array[i][operation_names[j]].workstation.toString() || "-"; 
      else
      td_op_workstation.innerText = "n/a";
      body_row.appendChild(td_op_workstation);
    
    
      var param_name_list = operation_parameters_obj[operation_names[j]];
      for(var k=0; k< param_name_list.length; k++)
      {
        let td_param_value = document.createElement("td");
        if(record_array[i][operation_names[j]])
        {
          if(record_array[i][operation_names[j]].actual_value[param_name_list[k]] == undefined 
            || record_array[i][operation_names[j]].actual_value[param_name_list[k]][0] == "")
          td_param_value.innerText = "-";
          else
          td_param_value.innerText = record_array[i][operation_names[j]].actual_value[param_name_list[k]][0] || "-";  

        }
        else
        td_param_value.innerText = "n/a";
        body_row.appendChild(td_param_value);    
      }

      let td_op_log_entry_dt = document.createElement("td");
      if(record_array[i][operation_names[j]])
      td_op_log_entry_dt.innerText = decode_date(record_array[i][operation_names[j]].log.entry_dt )|| "-"; 
      else
      td_op_log_entry_dt.innerText = "n/a";
      body_row.appendChild(td_op_log_entry_dt);
    
      let td_op_log_entry_by = document.createElement("td");
      td_op_log_entry_by.className = "text-break";
      if(record_array[i][operation_names[j]])
      td_op_log_entry_by.innerText = record_array[i][operation_names[j]].log.entry_by || "-"; 
      else
      td_op_log_entry_by.innerText = "n/a";
      body_row.appendChild(td_op_log_entry_by);
    
      let td_op_log_update_dt = document.createElement("td");
      if(record_array[i][operation_names[j]])
      td_op_log_update_dt.innerText = decode_date(record_array[i][operation_names[j]].log.update_dt) || "-"; 
      else
      td_op_log_update_dt.innerText = "n/a";
      body_row.appendChild(td_op_log_update_dt);
    
      let td_op_log_update_by = document.createElement("td");
      if(record_array[i][operation_names[j]])
      td_op_log_update_by.innerText = record_array[i][operation_names[j]].log.update_by || "-"; 
      else
      td_op_log_update_by.innerText = "n/a";
      body_row.appendChild(td_op_log_update_by);
  
      let td_op_log_deviation_dt = document.createElement("td");
      if(record_array[i][operation_names[j]])
      td_op_log_deviation_dt.innerText = decode_date(record_array[i][operation_names[j]].log.deviation_dt) || "-"; 
      else
      td_op_log_deviation_dt.innerText = "n/a";
      body_row.appendChild(td_op_log_deviation_dt);
    
      let td_op_log_deviation_by = document.createElement("td");
      if(record_array[i][operation_names[j]])
      td_op_log_deviation_by.innerText = record_array[i][operation_names[j]].log.deviation_by || "-";  
      else
      td_op_log_deviation_by.innerText = "n/a";
      body_row.appendChild(td_op_log_deviation_by);    
  
      let td_op_log_remark = document.createElement("td");
      if(record_array[i][operation_names[j]])
      td_op_log_remark.innerText = record_array[i][operation_names[j]].log.remark || "-";  
      else
      td_op_log_remark.innerText = "n/a";
      body_row.appendChild(td_op_log_remark);    


    }


    table_body.appendChild(body_row);

  } 
  // End of table body generation section

table.appendChild(table_header);
table.appendChild(table_body);

var tot_table_cols = header_row.childElementCount;
var all_items = generate_min_max_array(0,tot_table_cols-1);

var index = 8;              // where operation parameters start after Basic Info group
var main_items = [0,1];     // model & serial position
var basic_info_items = generate_min_max_array(main_items.length,index-1);     // 7 items

var buttons_config = [];

var basic_info_group = {
                          extend: 'colvisGroup',
                          text: 'Basic Info',
                          show: main_items.concat(basic_info_items),
                          hide: generate_diff_array(all_items, main_items.concat(basic_info_items))
                       };
buttons_config.push(basic_info_group);

// Operation wise item groups
for(var i=0; i < operation_names.length; i++ )
{
  // Each operation has 9 detail items + operation parameters
  var operation_parameter_count = operation_parameters_obj[operation_names[i]].length;
  var operation_items = generate_min_max_array(index, index + 9 + operation_parameter_count - 1);
  var operation_col_group = {
                              extend: 'colvisGroup',
                              text: operation_names[i],
                              show: main_items.concat(operation_items),
                              hide: generate_diff_array(all_items, main_items.concat(operation_items))
                            }
  buttons_config.push(operation_col_group);
  index = index + 9 + operation_parameter_count;
}

// Item group to show all columns
  var show_all_items_group =             {
                                          extend: 'colvisGroup',
                                          text: 'Show all',
                                          show: ':hidden'
                                       };

  buttons_config.push(show_all_items_group);                                       



  $("#"+ table_id).DataTable( {
                                              "lengthMenu": [[10, 25, 50, -1], [10, 25, 50, "All"]],
                                              "lengthChange": true,
                                              // Only show "Basic Info" columns initially
                                              "columnDefs": [
                                                              { targets: main_items.concat(basic_info_items), visible: true, "width": "100px"},
                                                              { targets: '_all', visible: false,  "width": "100px" }
                                                            ],
                                              "colReorder": true,
                                              "fixedColumns":   {leftColumns: 2},
                                              "paging": true,
                                              "dom": '<"row"<"col-sm-12 p-2"Bf>><t><"row"<"col-sm-4 mb-2 mt-2 text-left"l><"col-sm-4 mb-2 text-center"i><"col-sm-4 text-right mb-2"p>>',
                                              "buttons": [
                                                          {
                                                            extend: 'collection',
                                                            text: 'Select Viewing Mode',
                                                            buttons: buttons_config
                                                          },                                                        
                                                          "searchBuilder",
                                                          {
                                                            extend: 'collection',
                                                            text: 'Export Data',
                                                            buttons: ['copy','excel','csv']
                                                          },                                                          
                                                         ]
                                             });
return true;
}


// Support function to generate array from main_array excluding items from diff_array
function generate_diff_array(main_array, diff_array)
{
  var temp_array = [];
  for(var i=0; i<main_array.length; i++)
  {
    if(diff_array.indexOf(main_array[i]) < 0 )
    temp_array.push(main_array[i]);
  }

  return temp_array;
}


// support function to check if job record value is within filter criter. Return true if passes fileter criteria
function pass_filter_criteria(record, operation, model_filter_select="", status_filter_select="", workstation_filter_select = "", user_id_filter_select = "", date_filter_select = "")
{

  var date_filter = get_multi_selected_values(date_filter_select);
  var model_filter = get_multi_selected_values(model_filter_select);
  var status_filter = get_multi_selected_values(status_filter_select);
  var workstation_filter = get_multi_selected_values(workstation_filter_select);
  var user_id_filter = get_multi_selected_values(user_id_filter_select);

  if(date_filter.indexOf(decode_date(record[operation].log.entry_dt,2)) < 0 ) return false;

  if( model_filter.indexOf(record["Basic Info"].model) < 0 ) return false;

  var status;
  if(record[operation].status == 4) status = "Rejected";
  else if (record[operation].status == 0)
  {
    if( is_null(record[operation].log.deviation_by) )
    status = "Completed"
    else
    status = "Completed (with deviation)";
  }
  else status = "In Progress (deviation required)"

  if( status_filter.indexOf(status) < 0 ) return false;

  if( workstation_filter.indexOf(record[operation].workstation) < 0 ) return false;

  if ( user_id_filter.indexOf(record[operation].log.entry_by) < 0 ) return false;

  return true;
}

// support function to check if disruption record value is within filter criter. Return true if passes fileter criteria
function pass_disruption_filter_criteria(record, operation, model_filter_select="", status_filter_select="", workstation_filter_select = "", user_id_filter_select = "", date_filter_select = "")
{

  var date_filter = get_multi_selected_values(date_filter_select);
  var model_filter = get_multi_selected_values(model_filter_select);
  var status_filter = get_multi_selected_values(status_filter_select);
  var workstation_filter = get_multi_selected_values(workstation_filter_select);
  var user_id_filter = get_multi_selected_values(user_id_filter_select);

  if(date_filter.indexOf(decode_date(record.start_time,2)) < 0 ) return false;

  if( workstation_filter.indexOf(record.workstation) < 0 ) return false;

  if ( user_id_filter.indexOf(record.start_user) < 0 ) return false;

  return true;
}

// Support function to get values from multiple select dropdown field
function get_multi_selected_values(select_field_id)
{
  if(select_field_id == "") return [];

  var select_field_options = document.getElementById(select_field_id);
  var selected_options = [];

  for(var i=0; i<select_field_options.length; i++)
  {
    if(select_field_options[i].selected == true)
    selected_options.push(select_field_options[i].innerText);
  }

  return selected_options;
}



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                             Display Realtime Analytics - sub section of Dashboard                                  //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////     

//Function to initialize realtime analytics section
async function initialize_realtime_analytics_section()
{
  await reset_sections();
  await reset_canvases();

  var pending_jobs_select = document.getElementById("pending_jobs_breakdown_select");
  var completed_jobs_select = document.getElementById("completed_jobs_breakdown_select");

  pending_jobs_select.value = "realtime_pending_jobs_default";
  completed_jobs_select.value = "realtime_completed_jobs_default";
  set_realtime_chart_visiblity();

  document.getElementById("realtime_content_container").style.display = "none";
  
  pending_jobs_select.onchange = function() { set_realtime_chart_visiblity() };
  completed_jobs_select.onchange = function() { set_realtime_chart_visiblity() };

  fetch_realtime_analytics_data_btn.onclick = async function() 
    {

      // check user permissions
      if(gl_user_permission.admin == 1 || gl_user_permission[section_permission_list["View Dashboard"]] == 1 )
      {
        var start_date = new Date();
        var end_date = new Date();

        // Set start date time to 00:00:00
        start_date.setHours(0); start_date.setMinutes(0); start_date.setSeconds(0);
        start_date = firebase.firestore.Timestamp.fromDate(start_date)

        // Set end date time to 00:00:00
        end_date.setHours(23); end_date.setMinutes(59); end_date.setSeconds(59);
        end_date = firebase.firestore.Timestamp.fromDate(end_date)
       
        try{
        start_loading();  
        const download_realtime_analytics_data = functions.httpsCallable('download_realtime_analytics_data');
        gl_analytics_records_list = (await download_realtime_analytics_data({"start_date" : start_date, "end_date" : end_date})).data;

        //Reset charts & table containers on refreshing data
        await reset_canvases();

        var table_container = document.getElementById("realtime_analytics_job_records_table_container");
        empty_container_byReference(table_container);
        let table = document.createElement("table");
        table.className="table table-responsive table-striped table-bordered wrap display stripe row-border";
        table.style = "width:100%";
        table.id = "realtime_analytics_records_table";
        table_container.appendChild(table);


        // render charts & table
        await process_realtime_chart_data(gl_analytics_records_list);
        await render_table_job_records(gl_analytics_records_list, table.id);
        
        stop_loading();
        }
        catch(error)
        {
          display_error(error.message);
          return false;
        }


        set_realtime_chart_visiblity();
        document.getElementById("realtime_content_container").style.display = "block";
        return true;
      }
      else 
      {
        display_error("You do not have sufficient permissions for this operation. Please contact your admin.");
        return false;
      }

    }

}

//Support function to reset chart canvases
function reset_canvases()
{

  var realtime_pending_jobs_container = document.getElementById("realtime_pending_jobs_container");
  var realtime_completed_jobs_container = document.getElementById("realtime_completed_jobs_container");

  empty_container_byReference(realtime_pending_jobs_container);
  empty_container_byReference(realtime_completed_jobs_container);

  for(var i=0;i<pending_jobs_charts_list.length; i++)
  {
    var canvas = document.createElement('canvas');
    canvas.id = pending_jobs_charts_list[i];
    canvas.name = "realtime_pending_jobs";
    canvas.style.display = "none";
    realtime_pending_jobs_container.appendChild(canvas);
  }

  for(var i=0;i<completed_jobs_charts_list.length; i++)
  {
    var canvas = document.createElement('canvas');
    canvas.id = completed_jobs_charts_list[i];
    canvas.name = "realtime_completed_jobs";
    canvas.style.display = "none";
    realtime_completed_jobs_container.appendChild(canvas);
  }

}

//Function to collect data & display all graphs using support functions
function process_realtime_chart_data(records_array)
{
  var operation_label_list = [];

  // Get all operation names
  for(var i=0; i<records_array.length; i++)
  {

    operation_label_list = operation_label_list.concat(records_array[i]["Basic Info"].op_order);
    operation_label_list = Array.from(new Set(operation_label_list));

  }


  // Collect realtime data for pending jobs
  var pending_jobs_regular_data = {"Pending Jobs" : new Array(operation_label_list.length).fill(0) };
  var pending_jobs_model_data = {};
  var pending_jobs_status_data = {};

  for(var i=0; i<records_array.length; i++)
  {
    // Pending Operation present only if Overall Status is not Complete (0) or Rejected (4)
    if(records_array[i]["Basic Info"].status > 0 && records_array[i]["Basic Info"].status < 4 )
    {
        var pending_op = records_array[i]["Basic Info"].pending_op;
        if(is_null(pending_op)) pending_op = records_array[i]["Basic Info"].op_order[0];

        var pending_op_model = records_array[i]["Basic Info"].model;
        var pending_op_status = records_array[i][pending_op].status;

        // increase regular count for that operation by 1 
        pending_jobs_regular_data["Pending Jobs"][operation_label_list.indexOf(pending_op)] += 1;

        // increase model count for that operation by 1 
        if(pending_jobs_model_data[pending_op_model])    pending_jobs_model_data[pending_op_model][operation_label_list.indexOf(pending_op)] += 1;
        else 
        {
          pending_jobs_model_data[pending_op_model] = new Array(operation_label_list.length).fill(0);
          pending_jobs_model_data[pending_op_model][operation_label_list.indexOf(pending_op)] += 1
        }

        // increase status count for that operation by 1 
        if(pending_jobs_status_data[status_list[pending_op_status]])   
          pending_jobs_status_data[status_list[pending_op_status]][operation_label_list.indexOf(pending_op)] += 1;
        else 
        {
          pending_jobs_status_data[status_list[pending_op_status]] = new Array(operation_label_list.length).fill(0);
          pending_jobs_status_data[status_list[pending_op_status]][operation_label_list.indexOf(pending_op)] += 1
        }
    }

  }


  // Collect realtime data for completed jobs
  var completed_jobs_regular_data = {"Completed Jobs" : new Array(operation_label_list.length).fill(0) };
  var completed_jobs_model_data = {};
  var completed_jobs_status_data = {};
  var completed_jobs_workstation_data = {};
  var completed_jobs_user_data = {};
  var today = new Date();
  
  for(var i=0; i<records_array.length; i++)
  {
    var operations = records_array[i]["Basic Info"]["op_order"];

    for(var j=0; j< operations.length; j++)
    {
      if(   (records_array[i][operations[j]].status == 0 || records_array[i][operations[j]].status == 4) &&

            ( ( !is_null(records_array[i][operations[j]].log.entry_by) && is_same_day(decode_date(records_array[i][operations[j]].log.entry_dt,1) , today) ) 
           || ( !is_null(records_array[i][operations[j]].log.update_by) && is_same_day(decode_date(records_array[i][operations[j]].log.update_dt,1) , today) ) )   )

        {
            var completed_op = operations[j];
            var completed_op_model = records_array[i]["Basic Info"].model;
            var completed_op_status = records_array[i][completed_op].status;
            var completed_op_workstation = records_array[i][completed_op].workstation;
            var completed_op_user = (is_same_day(decode_date(records_array[i][operations[j]].log.entry_dt,1) , today)) ? 
                                    records_array[i][operations[j]].log.entry_by : records_array[i][operations[j]].log.update_by;


            // increase regular count for that operation by 1 
            completed_jobs_regular_data["Completed Jobs"][operation_label_list.indexOf(completed_op)] += 1;

            // increase model count for that operation by 1 
            if(completed_jobs_model_data[completed_op_model])  completed_jobs_model_data[completed_op_model][operation_label_list.indexOf(completed_op)] += 1;
            else 
            {
              completed_jobs_model_data[completed_op_model] = new Array(operation_label_list.length).fill(0);
              completed_jobs_model_data[completed_op_model][operation_label_list.indexOf(completed_op)] += 1
            }

            // increase status count for that operation by 1 
            if(completed_jobs_status_data[status_list[completed_op_status]])   
            completed_jobs_status_data[status_list[completed_op_status]][operation_label_list.indexOf(completed_op)] += 1;
            else 
            {
              completed_jobs_status_data[status_list[completed_op_status]] = new Array(operation_label_list.length).fill(0);
              completed_jobs_status_data[status_list[completed_op_status]][operation_label_list.indexOf(completed_op)] += 1
            }


            // increase workstation count for that operation by 1 
            if(completed_jobs_workstation_data[completed_op_workstation])   
            completed_jobs_workstation_data[completed_op_workstation][operation_label_list.indexOf(completed_op)] += 1;
            else 
            {
              completed_jobs_workstation_data[completed_op_workstation] = new Array(operation_label_list.length).fill(0);
              completed_jobs_workstation_data[completed_op_workstation][operation_label_list.indexOf(completed_op)] += 1
            }            

            // increase user count for that operation by 1 
            if(completed_jobs_user_data[completed_op_user])   
            completed_jobs_user_data[completed_op_user][operation_label_list.indexOf(completed_op)] += 1;
            else 
            {
              completed_jobs_user_data[completed_op_user] = new Array(operation_label_list.length).fill(0);
              completed_jobs_user_data[completed_op_user][operation_label_list.indexOf(completed_op)] += 1
            }   


        }
    }

  }



// Set chart properties & render all pending jobs & completed jobs charts
var realtime_pending_jobs_container = document.getElementById("realtime_pending_jobs_container");
realtime_pending_jobs_container.style.height = (operation_label_list.length * 10 + 12) + "vh";

var realtime_completed_jobs_container = document.getElementById("realtime_completed_jobs_container");
realtime_completed_jobs_container.style.height = (operation_label_list.length * 10 + 12) + "vh";


render_realtime_chart(operation_label_list, convert_data_to_chart_dataset(pending_jobs_regular_data), 'realtime_pending_jobs_default' );
render_realtime_chart(operation_label_list, convert_data_to_chart_dataset(pending_jobs_model_data), 'realtime_pending_jobs_model' );
render_realtime_chart(operation_label_list, convert_data_to_chart_dataset(pending_jobs_status_data), 'realtime_pending_jobs_status' );

render_realtime_chart(operation_label_list, convert_data_to_chart_dataset(completed_jobs_regular_data), 'realtime_completed_jobs_default' );
render_realtime_chart(operation_label_list, convert_data_to_chart_dataset(completed_jobs_model_data), 'realtime_completed_jobs_model' );
render_realtime_chart(operation_label_list, convert_data_to_chart_dataset(completed_jobs_status_data), 'realtime_completed_jobs_status' );
render_realtime_chart(operation_label_list, convert_data_to_chart_dataset(completed_jobs_workstation_data), 'realtime_completed_jobs_workstation' );
render_realtime_chart(operation_label_list, convert_data_to_chart_dataset(completed_jobs_user_data), 'realtime_completed_jobs_user' );


}


// Support function to show / hide charts as per selection
function set_realtime_chart_visiblity()
{
  // Set display for pending jobs chart
  for(var i=0;i<pending_jobs_charts_list.length; i++)
  {
    document.getElementById(pending_jobs_charts_list[i]).style.display = "none";
  }

  var current_pending_jobs_chart = document.getElementById("pending_jobs_breakdown_select").value;
  document.getElementById(current_pending_jobs_chart).style.display="block";

  // Set display for completed jobs chart
  for(var i=0;i<completed_jobs_charts_list.length; i++)
  {
    document.getElementById(completed_jobs_charts_list[i]).style.display = "none";
  }

  var current_completed_jobs_chart = document.getElementById("completed_jobs_breakdown_select").value;
  document.getElementById(current_completed_jobs_chart).style.display="block";


}


//Support function to format axis labels to multiple lines
function formatLabel(str, maxwidth=10){
  var sections = [];
  var words = str.split(" ");
  var temp = "";

  words.forEach(function(item, index){
      if(temp.length > 0)
      {
          var concat = temp + ' ' + item;

          if(concat.length > maxwidth){
              sections.push(temp);
              temp = "";
          }
          else{
              if(index == (words.length-1))
              {
                  sections.push(concat);
                  return;
              }
              else{
                  temp = concat;
                  return;
              }
          }
      }

      if(index == (words.length-1))
      {
          sections.push(item);
          return;
      }

      if(item.length < maxwidth) {
          temp = item;
      }
      else {
          sections.push(item);
      }

  });

  return sections;
}

// Support function to check if 2 dates have same day (not necessarily same time)
function is_same_day(date1, date2)
{
   if ( date1.getFullYear() == date2.getFullYear() && date1.getMonth() == date2.getMonth() && date1.getDate() == date2.getDate() )  return true;

   else return false;
}

// Format chart data as required by chart dataset variable
function convert_data_to_chart_dataset(input_data)
{
  var dataset = [];

  var keys = Object.keys(input_data);
  for(var i=0; i< keys.length; i++)
  {
    var dataset_item = 
                       {
                        label: keys[i],
                        data: input_data[keys[i]],
                        stack: 1,
                        maxBarThickness: 50,
                        barThickness: 'flex',
                        backgroundColor: (keys.length<=indexcolors.length) ? indexcolors[i] : "#4E73DF" ,
                       }
    dataset.push(dataset_item);
  }
return dataset;
}


function render_realtime_chart(chart_labels,chart_data, chart_id, chart_title = "Number of Jobs")
{
    var formatted_chart_labels = [];
    // Split labels into multiple lines if too long             
    for(var i=0; i< chart_labels.length; i++)   formatted_chart_labels[i] = formatLabel(chart_labels[i]);


    var chart_options = {
                          responsive:true,
                          maintainAspectRatio:false,
                          scales: {
                                    xAxes: [{ stacked: true,
                                              scaleLabel: 
                                              {
                                                display: true,
                                                labelString: chart_title
                                              }      
                                            }],
                                    yAxes: [{ gridLines: { display:false},
                                              stacked: true }]
                                  },
                          legend: {
                                    display: true
                                  }
                        }


    var ctx = document.getElementById(chart_id).getContext('2d');

    var myChart = new Chart(ctx, {
                                    type: 'horizontalBar',
                                    data: {
                                            labels: formatted_chart_labels,
                                            datasets: chart_data
                                          },
                                    options: chart_options
                                  });

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                        Display Daily Operation Analytics - sub section of Dashboard                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////     

//Function to initialize daily analytics section
async function initialize_daily_operation_analytics_section()
{
  reset_sections();

  document.getElementById("daily_analytics_start_datepicker").value = "";
  document.getElementById("daily_analytics_end_datepicker").value = "";
  empty_container("daily_analytics_operation_select");
  document.getElementById("daily_analytics_main_content").style.display = "none";

  $('#daily_analytics_start_datepicker').datepicker({ uiLibrary: 'bootstrap4'  });
  $('#daily_analytics_end_datepicker').datepicker({ uiLibrary: 'bootstrap4'  });


  if( is_null(gl_current_operations_list) )
  gl_current_operations_list = await read_production_operations_list();

  var operation_name_list = Object.keys(gl_current_operations_list);
  operation_name_list = operation_name_list.sort();
  var permitted_operation_list = ["Select Operation"];

  // Set list of operations where user has read permissions
  for(var i=0; i<operation_name_list.length; i++)
  {
    if(gl_user_permission.admin == 1 || gl_user_permission[operation_name_list[i]] >= 1 )
    permitted_operation_list.push(operation_name_list[i]);
  }

  set_select_options(document.getElementById("daily_analytics_operation_select"), permitted_operation_list);
 

  fetch_daily_analytics_data_btn.onclick = async function(){

    var start_date = document.getElementById("daily_analytics_start_datepicker").value;
    var end_date = document.getElementById("daily_analytics_end_datepicker").value;
    gl_analytics_operation_name = document.getElementById("daily_analytics_operation_select").value;


    if (is_null(start_date) || is_null(end_date) || is_null(gl_analytics_operation_name) ) 
    {
      display_error("Please select start and end date before fetching data");
      return false;
    }
    else
    {
      start_date = new Date(start_date);
      end_date = new Date(end_date);
    }


    if(end_date - start_date < 0)
    {
      display_error("End Date should be greater than or same as Start Date");
      return false;
    }

    if(gl_analytics_operation_name == "Select Operation")
    {
      display_error("Please select Operation before fetching data");
      return false;
    }

    if(gl_user_permission.admin != 1 && (gl_user_permission[gl_analytics_operation_name] < 1 || gl_user_permission[section_permission_list["View Dashboard"]] != 1 ) )
    {
      display_error("You do not have sufficient permissions for this operation. Please contact your admin.");
      return false;
    }

    // set start and end times of dates & get timestamps
    start_date.setHours(0); start_date.setMinutes(0); start_date.setSeconds(0);
    end_date.setHours(23); end_date.setMinutes(59); end_date.setSeconds(59);

    const start_dt = firebase.firestore.Timestamp.fromDate(start_date);
    const end_dt = firebase.firestore.Timestamp.fromDate(end_date);

    try{
      start_loading();  
      const download_operation_analytics_data = functions.httpsCallable('download_operation_analytics_data');
      const fetched_data = (await download_operation_analytics_data({"start_date" : start_dt, "end_date" : end_dt, "operation_name" : gl_analytics_operation_name})).data;
      gl_analytics_records_list = fetched_data.job_records;
      gl_analytics_disruption_records_list = fetched_data.disruption_records; 

      var table_container = document.getElementById("daily_analytics_job_records_table_container");
      empty_container_byReference(table_container);
      let table = document.createElement("table");
      table.className="table table-responsive table-striped table-bordered wrap display stripe row-border";
      table.style = "width:100%";
      table.id = "daily_analytics_records_table";
      table_container.appendChild(table);


      await process_daily_analytics_data(gl_analytics_records_list,gl_analytics_disruption_records_list, gl_analytics_operation_name);
      await render_table_job_records(gl_analytics_records_list, table.id, [gl_analytics_operation_name]);
      document.getElementById("daily_analytics_main_content").style.display = "block";

      stop_loading();
      }
      catch(error)
      {
        display_error(error.message);
        return false;
      }      

  }

}


function process_daily_analytics_data(records_list,disruption_records_list, operation_name)
{
  //reset breakdown view mode
  document.getElementById("daily_analytics_breakdown_select").value = "daily_analytics_graph_default";
  
  var date_list = [];
  var model_list = [];
  var status_list = [];
  var workstation_list = [];
  var user_list = [];

  // Get all available options from job records of models, status, workstation, user ids, etc for data filters
  for(var i=0; i< records_list.length; i++)
  {
    date_list.push(decode_date(records_list[i][operation_name]["log"]["entry_dt"],2) );
    model_list.push(records_list[i]["Basic Info"]["model"]);
    workstation_list.push(records_list[i][operation_name]["workstation"]);
    user_list.push(records_list[i][operation_name]["log"]["entry_by"]);

    if(records_list[i][operation_name]["status"] == 4)
    status_list.push("Rejected");
    else if(records_list[i][operation_name]["status"] == 0)
    {
      if( is_null(records_list[i][operation_name]["log"]["deviation_by"]) )
      status_list.push("Completed");
      else
      status_list.push("Completed (with deviation)");
    }    
    else status_list.push("In Progress (deviation required)");
  }

  // Get all available options from disruption records of models, status, workstation, user ids, etc for data filters
  for(var i=0; i< disruption_records_list.length; i++)
  {
    date_list.push(decode_date(disruption_records_list[i]["start_time"],2) );
    workstation_list.push(disruption_records_list[i]["workstation"]);
    user_list.push(disruption_records_list[i]["start_user"]);
  }


  //Keep only unique options
  date_list = Array.from(new Set(date_list)).sort();
  model_list = Array.from(new Set(model_list)).sort();
  status_list = Array.from(new Set(status_list)).sort();
  workstation_list = Array.from(new Set(workstation_list)).sort();
  user_list = Array.from(new Set(user_list)).sort();

  empty_container("daily_analytics_filter_date");
  empty_container("daily_analytics_filter_model");
  empty_container("daily_analytics_filter_status");
  empty_container("daily_analytics_filter_workstation");
  empty_container("daily_analytics_filter_user");

  set_select_options(document.getElementById("daily_analytics_filter_date") , date_list);
  set_select_options(document.getElementById("daily_analytics_filter_model") , model_list);
  set_select_options(document.getElementById("daily_analytics_filter_status") , status_list);
  set_select_options(document.getElementById("daily_analytics_filter_workstation") , workstation_list);
  set_select_options(document.getElementById("daily_analytics_filter_user") , user_list);
  $('.selectpicker').selectpicker('refresh');     // Refresh / update state of all select pickers

  // Select all options in filters initially
  $('#daily_analytics_filter_date').selectpicker('selectAll');
  $('#daily_analytics_filter_model').selectpicker('selectAll');
  $('#daily_analytics_filter_status').selectpicker('selectAll');
  $('#daily_analytics_filter_workstation').selectpicker('selectAll');
  $('#daily_analytics_filter_user').selectpicker('selectAll');


  var daily_analytics_charts_container = document.getElementById("daily_analytics_charts_container");
  daily_analytics_charts_container.style.height = (50) + "vh";

  var breakdown_select_container = document.getElementById("daily_analytics_breakdown_select");

  var data_obj = convert_data_to_daily_analytics_chart_dataset(records_list, operation_name);
  render_daily_analytics_graph( daily_analytics_charts_container, data_obj, operation_name, breakdown_select_container.value);

  breakdown_select_container.onchange = function(){

    
    var data_obj = {};

    if(breakdown_select_container.value == "daily_analytics_graph_disruption_mins" || breakdown_select_container.value == "daily_analytics_graph_disruption_count")
    data_obj = convert_disruption_data_to_daily_analytics_chart_dataset(disruption_records_list, operation_name, breakdown_select_container.value);
    else 
    data_obj = convert_data_to_daily_analytics_chart_dataset(records_list, operation_name, breakdown_select_container.value);
    
    render_daily_analytics_graph( daily_analytics_charts_container, data_obj, operation_name, breakdown_select_container.value);

  }

  var daily_analytics_filter_container = document.getElementById("daily_analytics_filter_container");
  daily_analytics_filter_container.onchange = function(){

    var data_obj = {};

    if(breakdown_select_container.value == "daily_analytics_graph_disruption_mins" || breakdown_select_container.value == "daily_analytics_graph_disruption_count")
    data_obj = convert_disruption_data_to_daily_analytics_chart_dataset(disruption_records_list, operation_name, breakdown_select_container.value);
    else 
    data_obj = convert_data_to_daily_analytics_chart_dataset(records_list, operation_name, breakdown_select_container.value);
    
    render_daily_analytics_graph( daily_analytics_charts_container, data_obj, operation_name, breakdown_select_container.value);

    }
return true;
}

// Format chart job data as required by chart dataset variable
function convert_data_to_daily_analytics_chart_dataset(record_list = [], operation_name, breakdown_mode = "daily_analytics_graph_default")
{

  // Get records as per filter criteria & get daily date labels as per local time
  var filtered_data_list = [];
  var date_list = [];

  for(var i=0; i<record_list.length; i++)
    {
      if(pass_filter_criteria(record_list[i], operation_name, "daily_analytics_filter_model", "daily_analytics_filter_status",
                              "daily_analytics_filter_workstation", "daily_analytics_filter_user","daily_analytics_filter_date" ))
      {
        filtered_data_list.push(record_list[i]);
        var dt = decode_date(record_list[i][operation_name].log.entry_dt, 1);

        var date_label = dt.getDate() + "-"  + monthNames[dt.getMonth()].substr(0,3) + "-" + dt.getFullYear();
        if(date_list.indexOf(date_label) < 0) date_list.push(date_label);
      }
    }
  
    var data_count = {};
    var breakdown_categories = [];

  // default breakdown view
  if(breakdown_mode == "daily_analytics_graph_default")
  {
    // Get categories of breakdown type - eg model names, workstation names, etc
     breakdown_categories[0] = ["# of Jobs"]; 

    for(var i=0; i<breakdown_categories.length; i++)
    {
      data_count[breakdown_categories[i]] = new Array(date_list.length).fill(0)
    }

    for(var i=0; i<filtered_data_list.length; i++)
    {
      var entry_dt = decode_date(filtered_data_list[i][operation_name]["log"]["entry_dt"],1);
      var date_label = entry_dt.getDate() + "-"  + monthNames[entry_dt.getMonth()].substr(0,3) + "-" + entry_dt.getFullYear();

      var index = date_list.indexOf(date_label);

      data_count[breakdown_categories[0]][index] += 1;
    }

  }

  // model breakdown view
  if(breakdown_mode == "daily_analytics_graph_model")
  {
    // Get categories of breakdown type - eg model names, workstation names, etc
    for(var i=0; i< filtered_data_list.length; i++)
    {
      if(breakdown_categories.indexOf(filtered_data_list[i]["Basic Info"].model) < 0 )
      {
        breakdown_categories.push(filtered_data_list[i]["Basic Info"].model);
      }

    }
    breakdown_categories = breakdown_categories.sort();


    for(var i=0; i<breakdown_categories.length; i++)
    {
      data_count[breakdown_categories[i]] = new Array(date_list.length).fill(0)
    }

    for(var i=0; i<filtered_data_list.length; i++)
    {
      var entry_dt = decode_date(filtered_data_list[i][operation_name]["log"]["entry_dt"],1);
      var date_label = entry_dt.getDate() + "-"  + monthNames[entry_dt.getMonth()].substr(0,3) + "-" + entry_dt.getFullYear();

      var index = date_list.indexOf(date_label);

      // Select category model that record belongs to
      var category = filtered_data_list[i]["Basic Info"].model;

      data_count[category][index] += 1;
    }

  }


    // status breakdown view
    if(breakdown_mode == "daily_analytics_graph_status")
  {
    // Get categories of breakdown type - eg model names, workstation names, etc
    for(var i=0; i< filtered_data_list.length; i++)
    {
      var status = "";

      if(filtered_data_list[i][operation_name].status == 4) status = "Rejected";
      else if (filtered_data_list[i][operation_name].status == 0)
      {
        if(is_null(filtered_data_list[i][operation_name].log.deviation_by))
        status = "Completed";
        else
        status = "Completed (with deviation)";
      }
      else status = "In Progress (deviation required)";

      if(breakdown_categories.indexOf(status) < 0 )
      {
        breakdown_categories.push(status);
      }

    }
    breakdown_categories = breakdown_categories.sort();


    for(var i=0; i<breakdown_categories.length; i++)
    {
      data_count[breakdown_categories[i]] = new Array(date_list.length).fill(0)
    }

    for(var i=0; i<filtered_data_list.length; i++)
    {
      var entry_dt = decode_date(filtered_data_list[i][operation_name]["log"]["entry_dt"],1);
      var date_label = entry_dt.getDate() + "-"  + monthNames[entry_dt.getMonth()].substr(0,3) + "-" + entry_dt.getFullYear();

      var index = date_list.indexOf(date_label);

      // Select category model that record belongs to
      var category = "";
      if(filtered_data_list[i][operation_name].status == 4) category = "Rejected";
      else if (filtered_data_list[i][operation_name].status == 0)
      {
        if(is_null(filtered_data_list[i][operation_name].log.deviation_by))
        category = "Completed";
        else
        category = "Completed (with deviation)";
      }
      else category = "In Progress (deviation required)";

      data_count[category][index] += 1;
    }

  }


  // workstation breakdown view
  if(breakdown_mode == "daily_analytics_graph_workstation")
  {
    // Get categories of breakdown type - eg model names, workstation names, etc
    for(var i=0; i< filtered_data_list.length; i++)
    {
      if(breakdown_categories.indexOf(filtered_data_list[i][operation_name].workstation) < 0 )
      {
        breakdown_categories.push(filtered_data_list[i][operation_name].workstation);
      }

    }
    breakdown_categories = breakdown_categories.sort();


    for(var i=0; i<breakdown_categories.length; i++)
    {
      data_count[breakdown_categories[i]] = new Array(date_list.length).fill(0)
    }

    for(var i=0; i<filtered_data_list.length; i++)
    {
      var entry_dt = decode_date(filtered_data_list[i][operation_name]["log"]["entry_dt"],1);
      var date_label = entry_dt.getDate() + "-"  + monthNames[entry_dt.getMonth()].substr(0,3) + "-" + entry_dt.getFullYear();

      var index = date_list.indexOf(date_label);

      // Select category model that record belongs to
      var category = filtered_data_list[i][operation_name].workstation;

      data_count[category][index] += 1;
    }

  }


  // user id breakdown view
  if(breakdown_mode == "daily_analytics_graph_user_id")
  {
    // Get categories of breakdown type - eg model names, workstation names, etc
    for(var i=0; i< filtered_data_list.length; i++)
    {
      if(breakdown_categories.indexOf(filtered_data_list[i][operation_name].log.entry_by) < 0 )
      {
        breakdown_categories.push(filtered_data_list[i][operation_name].log.entry_by);
      }

    }
    breakdown_categories = breakdown_categories.sort();


    for(var i=0; i<breakdown_categories.length; i++)
    {
      data_count[breakdown_categories[i]] = new Array(date_list.length).fill(0)
    }

    for(var i=0; i<filtered_data_list.length; i++)
    {
      var entry_dt = decode_date(filtered_data_list[i][operation_name]["log"]["entry_dt"],1);
      var date_label = entry_dt.getDate() + "-"  + monthNames[entry_dt.getMonth()].substr(0,3) + "-" + entry_dt.getFullYear();

      var index = date_list.indexOf(date_label);

      // Select category model that record belongs to
      var category = filtered_data_list[i][operation_name].log.entry_by;

      data_count[category][index] += 1;
    }

  }
  


  // job hours breakdown view
  if(breakdown_mode == "daily_analytics_graph_job_hours")
  {
    // Get categories of breakdown type - eg model names, workstation names, etc
     breakdown_categories[0] = ["Job Hours Completed"]; 

    for(var i=0; i<breakdown_categories.length; i++)
    {
      data_count[breakdown_categories[i]] = new Array(date_list.length).fill(0)
    }

    for(var i=0; i<filtered_data_list.length; i++)
    {
      var entry_dt = decode_date(filtered_data_list[i][operation_name]["log"]["entry_dt"],1);
      var date_label = entry_dt.getDate() + "-"  + monthNames[entry_dt.getMonth()].substr(0,3) + "-" + entry_dt.getFullYear();

      var index = date_list.indexOf(date_label);

      data_count[breakdown_categories[0]][index] += filtered_data_list[i][operation_name]["cycle_time"] / 60;
    }

    // display job hours only till 1st integer place
    for(var i=0; i< date_list.length; i++)
    {
      data_count[breakdown_categories[0]][i] = Number(data_count[breakdown_categories[0]][i]).toFixed(1) ;
    }


  }


  // build final dataset for graph
  var dataset = [];

  for(var i=0; i< breakdown_categories.length; i++)
  {
    dataset.push({
                    label : breakdown_categories[i],
                    data : data_count[breakdown_categories[i]],
                    stack : 1,
                    backgroundColor: (i<=indexcolors.length) ? indexcolors[i] : "#4E73DF" ,
                    maxBarThickness: 60
                 })
  }

  return {
            "dataset" : dataset,
            "stack_labels" : breakdown_categories,
            "axis_labels" : date_list
         };

}

// Format chart disruption data as required by chart dataset variable
function convert_disruption_data_to_daily_analytics_chart_dataset(disruption_record_list = [], operation_name, breakdown_mode = "daily_analytics_graph_disruption_mins")
{

  // Get disruption records as per filter criteria & get daily date labels as per local time
  var filtered_data_list = [];
  var date_list = [];

  for(var i=0; i<disruption_record_list.length; i++)
    {
      if(pass_disruption_filter_criteria(disruption_record_list[i], operation_name, "daily_analytics_filter_model", "daily_analytics_filter_status",
                              "daily_analytics_filter_workstation", "daily_analytics_filter_user","daily_analytics_filter_date" ))
      {
        filtered_data_list.push(disruption_record_list[i]);
        var dt = decode_date(disruption_record_list[i].start_time, 1);

        var date_label = dt.getDate() + "-"  + monthNames[dt.getMonth()].substr(0,3) + "-" + dt.getFullYear();
        if(date_list.indexOf(date_label) < 0) date_list.push(date_label);
      }
    }
  
    var data_count = {};
    var breakdown_categories = [];



  // disruption hours breakdown view
  if(breakdown_mode == "daily_analytics_graph_disruption_mins")
  {
    // Get categories of breakdown type - eg model names, workstation names, etc
    for(var i=0; i< filtered_data_list.length; i++)
    {
      if(breakdown_categories.indexOf(filtered_data_list[i].reason) < 0 )
      {
        breakdown_categories.push(filtered_data_list[i].reason);
      }

    }
    breakdown_categories = breakdown_categories.sort();


    for(var i=0; i<breakdown_categories.length; i++)
    {
      data_count[breakdown_categories[i]] = new Array(date_list.length).fill(0)
    }

    for(var i=0; i<filtered_data_list.length; i++)
    {
      var entry_dt = decode_date(filtered_data_list[i].start_time,1);
      var date_label = entry_dt.getDate() + "-"  + monthNames[entry_dt.getMonth()].substr(0,3) + "-" + entry_dt.getFullYear();

      var index = date_list.indexOf(date_label);

      // Select category model that record belongs to
      var category = filtered_data_list[i].reason;

      var disruption_minutes =  (decode_date(filtered_data_list[i].end_time|| new Date(),1) - decode_date(filtered_data_list[i].start_time,1)) / (1000 * 60);
      disruption_minutes = Math.round(disruption_minutes); 

      data_count[category][index] += disruption_minutes;
    }

  }

  // disruption hours breakdown view
  if(breakdown_mode == "daily_analytics_graph_disruption_count")
  {
    // Get categories of breakdown type - eg model names, workstation names, etc
    for(var i=0; i< filtered_data_list.length; i++)
    {
      if(breakdown_categories.indexOf(filtered_data_list[i].reason) < 0 )
      {
        breakdown_categories.push(filtered_data_list[i].reason);
      }

    }
    breakdown_categories = breakdown_categories.sort();


    for(var i=0; i<breakdown_categories.length; i++)
    {
      data_count[breakdown_categories[i]] = new Array(date_list.length).fill(0)
    }

    for(var i=0; i<filtered_data_list.length; i++)
    {
      var entry_dt = decode_date(filtered_data_list[i].start_time,1);
      var date_label = entry_dt.getDate() + "-"  + monthNames[entry_dt.getMonth()].substr(0,3) + "-" + entry_dt.getFullYear();

      var index = date_list.indexOf(date_label);

      // Select category model that record belongs to
      var category = filtered_data_list[i].reason;

      data_count[category][index] += 1;
    }

  }


  // build final dataset for graph
  var dataset = [];

  for(var i=0; i< breakdown_categories.length; i++)
  {
    dataset.push({
                    label : breakdown_categories[i],
                    data : data_count[breakdown_categories[i]],
                    stack : 1,
                    backgroundColor: (i<=indexcolors.length) ? indexcolors[i] : "#4E73DF" ,
                    maxBarThickness: 60
                 })
  }

  return {
            "dataset" : dataset,
            "stack_labels" : breakdown_categories,
            "axis_labels" : date_list
         };

}


function render_daily_analytics_graph( chart_container, data_obj , operation_name,  breakdown_mode = "daily_analytics_graph_default")
{

  chart_data = data_obj.dataset;
  chart_labels =  data_obj.axis_labels;

  var chart_title = "Number of Jobs Per Day (" + operation_name + ")";
  if(breakdown_mode == "daily_analytics_graph_job_hours") chart_title = "Total Cycle Time of Jobs Processed per Day (hours)";
  if(breakdown_mode == "daily_analytics_graph_disruption_mins") chart_title = "Disruptions Reported for " + operation_name + " (minutes)";
  if(breakdown_mode == "daily_analytics_graph_disruption_count") chart_title = "# Disruptions Reported for " + operation_name;


  empty_container_byReference(chart_container);
  var canvas = document.createElement('canvas');
  canvas.id = "daily_analytics_charts_canvas";
  chart_container.appendChild(canvas);
  var ctx = canvas.getContext('2d');
    
  var formatted_chart_labels = [];
    // Split labels into multiple lines if too long             
    for(var i=0; i< chart_labels.length; i++)   formatted_chart_labels[i] = formatLabel(chart_labels[i]);


  var chart_options = {
                          responsive:true,
                          maintainAspectRatio:false,
                          scales: {
                                    xAxes: [{ stacked: true,
                                              scaleLabel: 
                                              {
                                                display: true,
                                                labelString: chart_title
                                              }      
                                            }],
                                    yAxes: [{ gridLines: { display:false},
                                              stacked: true, barThickness: 'flex', }]
                                  },
                          legend: {
                                    display: true
                                  }
                        }

  var myChart = new Chart(ctx, {
                                    type: 'bar',
                                    data: {
                                            labels: formatted_chart_labels,
                                            datasets: chart_data
                                          },
                                    options: chart_options
                                });

}



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                        Display Hourly Operation Analytics - sub section of Dashboard                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////     

//Function to initialize hourly analytics section
async function initialize_hourly_operation_analytics_section()
{
  reset_sections();

  document.getElementById("hourly_analytics_start_datepicker").value = "";
  document.getElementById("hourly_analytics_end_datepicker").value = "";
  empty_container("hourly_analytics_operation_select");
  document.getElementById("hourly_analytics_main_content").style.display = "none";

  $('#hourly_analytics_start_datepicker').datepicker({ uiLibrary: 'bootstrap4'  }); 
  $('#hourly_analytics_end_datepicker').datepicker({ uiLibrary: 'bootstrap4'  });

  if( is_null(gl_current_operations_list) )
  gl_current_operations_list = await read_production_operations_list();

  var operation_name_list = Object.keys(gl_current_operations_list);
  operation_name_list = operation_name_list.sort();
  var permitted_operation_list = ["Select Operation"];

  // Set list of operations where user has read permissions
  for(var i=0; i<operation_name_list.length; i++)
  {
    if(gl_user_permission.admin == 1 || gl_user_permission[operation_name_list[i]] >= 1 )
    permitted_operation_list.push(operation_name_list[i]);
  }

  set_select_options(document.getElementById("hourly_analytics_operation_select"), permitted_operation_list);
 

  fetch_hourly_analytics_data_btn.onclick = async function(){

    var start_date = document.getElementById("hourly_analytics_start_datepicker").value;
    var end_date = document.getElementById("hourly_analytics_end_datepicker").value;
    gl_analytics_operation_name = document.getElementById("hourly_analytics_operation_select").value;


    if (is_null(start_date) || is_null(end_date) || is_null(gl_analytics_operation_name) ) 
    {
      display_error("Please select start and end date before fetching data");
      return false;
    }
    else
    {
      start_date = new Date(start_date);
      end_date = new Date(end_date);
    }

    if(end_date - start_date < 0)
    {
      display_error("End Date should be greater than or same as Start Date");
      return false;
    }

    if(gl_analytics_operation_name == "Select Operation")
    {
      display_error("Please select Operation before fetching data");
      return false;
    }

    if(gl_user_permission.admin != 1 && (gl_user_permission[gl_analytics_operation_name] < 1 || gl_user_permission[section_permission_list["View Dashboard"]] != 1 ) )
    {
      display_error("You do not have sufficient permissions for this operation. Please contact your admin.");
      return false;
    }

    // set start and end times of dates & get timestamps
    start_date.setHours(0); start_date.setMinutes(0); start_date.setSeconds(0);
    end_date.setHours(23); end_date.setMinutes(59); end_date.setSeconds(59);

    const start_dt = firebase.firestore.Timestamp.fromDate(start_date);
    const end_dt = firebase.firestore.Timestamp.fromDate(end_date);

    try{
      start_loading();  
      const download_operation_analytics_data = functions.httpsCallable('download_operation_analytics_data');
      const fetched_data = (await download_operation_analytics_data({"start_date" : start_dt, "end_date" : end_dt, "operation_name" : gl_analytics_operation_name})).data;
      gl_analytics_records_list = fetched_data.job_records;
      gl_analytics_disruption_records_list = fetched_data.disruption_records; 

      var table_container = document.getElementById("hourly_analytics_job_records_table_container");
      empty_container_byReference(table_container);
      let table = await document.createElement("table");
      table.className="table table-responsive table-striped table-bordered wrap display stripe row-border";
      table.style = "width:100%";
      table.id = "hourly_analytics_records_table";
      table_container.appendChild(table);

      await process_hourly_analytics_data(gl_analytics_records_list, gl_analytics_disruption_records_list, gl_analytics_operation_name);
      await render_table_job_records(gl_analytics_records_list, table.id, [gl_analytics_operation_name])
      document.getElementById("hourly_analytics_main_content").style.display = "block";
    
      stop_loading();
      }
      catch(error)
      {
        display_error(error.message);
        return false;
      }

  }

}


function process_hourly_analytics_data(records_list, disruption_records_list, operation_name)
{

  //reset breakdown view mode
  document.getElementById("hourly_analytics_breakdown_select").value = "hourly_analytics_graph_default";

  var date_list = [];
  var model_list = [];
  var status_list = [];
  var workstation_list = [];
  var user_list = [];

  // Get all available options from job records of dates, models, status, workstation, user ids, etc for data filters
  for(var i=0; i< records_list.length; i++)
  {
    date_list.push(decode_date(records_list[i][operation_name]["log"]["entry_dt"],2) );    
    model_list.push(records_list[i]["Basic Info"]["model"]);
    workstation_list.push(records_list[i][operation_name]["workstation"]);
    user_list.push(records_list[i][operation_name]["log"]["entry_by"]);

    if(records_list[i][operation_name]["status"] == 4)
    status_list.push("Rejected");
    else if(records_list[i][operation_name]["status"] == 0)
    {
      if(records_list[i][operation_name]["log"]["deviation_by"] == "")
      status_list.push("Completed");
      else
      status_list.push("Completed (with deviation)");
    }
    else
    status_list.push("In Progress (deviation required)") 
  }

  // Get all available options from disruption records of models, status, workstation, user ids, etc for data filters
  for(var i=0; i< disruption_records_list.length; i++)
  {
    date_list.push(decode_date(disruption_records_list[i]["start_time"],2) );
    workstation_list.push(disruption_records_list[i]["workstation"]);
    user_list.push(disruption_records_list[i]["start_user"]);
  }
 
  //Keep only unique options
  date_list = Array.from(new Set(date_list));
  model_list = Array.from(new Set(model_list)).sort();
  status_list = Array.from(new Set(status_list)).sort();
  workstation_list = Array.from(new Set(workstation_list)).sort();
  user_list = Array.from(new Set(user_list)).sort();


  empty_container("hourly_analytics_filter_date");
  empty_container("hourly_analytics_filter_model");
  empty_container("hourly_analytics_filter_status");
  empty_container("hourly_analytics_filter_workstation");
  empty_container("hourly_analytics_filter_user");

  set_select_options(document.getElementById("hourly_analytics_filter_date") , date_list);
  set_select_options(document.getElementById("hourly_analytics_filter_model") , model_list);
  set_select_options(document.getElementById("hourly_analytics_filter_status") , status_list);
  set_select_options(document.getElementById("hourly_analytics_filter_workstation") , workstation_list);
  set_select_options(document.getElementById("hourly_analytics_filter_user") , user_list);
  $('.selectpicker').selectpicker('refresh');     // Refresh / update state of all select pickers

  // Select all options in filters initially
  $('#hourly_analytics_filter_date').selectpicker('selectAll');
  $('#hourly_analytics_filter_model').selectpicker('selectAll');
  $('#hourly_analytics_filter_status').selectpicker('selectAll');
  $('#hourly_analytics_filter_workstation').selectpicker('selectAll');
  $('#hourly_analytics_filter_user').selectpicker('selectAll');


  var hourly_analytics_charts_container = document.getElementById("hourly_analytics_charts_container");
  hourly_analytics_charts_container.style.height = (50) + "vh";

  var breakdown_select_container = document.getElementById("hourly_analytics_breakdown_select");

  var data_obj = convert_data_to_hourly_analytics_chart_dataset(records_list, operation_name);
  render_hourly_analytics_graph( hourly_analytics_charts_container, data_obj, operation_name, breakdown_select_container.value);

  breakdown_select_container.onchange = function(){

    var data_obj = {};

    if(breakdown_select_container.value == "hourly_analytics_graph_disruption_mins" || breakdown_select_container.value == "hourly_analytics_graph_disruption_count")
    data_obj = convert_disruption_data_to_hourly_analytics_chart_dataset(disruption_records_list, operation_name, breakdown_select_container.value);
    else 
    data_obj = convert_data_to_hourly_analytics_chart_dataset(records_list, operation_name, breakdown_select_container.value);
    
    render_hourly_analytics_graph( hourly_analytics_charts_container, data_obj, operation_name, breakdown_select_container.value);

  }

  var hourly_analytics_filter_container = document.getElementById("hourly_analytics_filter_container");
  hourly_analytics_filter_container.onchange = function(){

    var data_obj = {};

    if(breakdown_select_container.value == "hourly_analytics_graph_disruption_mins" || breakdown_select_container.value == "hourly_analytics_graph_disruption_count")
    data_obj = convert_disruption_data_to_hourly_analytics_chart_dataset(disruption_records_list, operation_name, breakdown_select_container.value);
    else 
    data_obj = convert_data_to_hourly_analytics_chart_dataset(records_list, operation_name, breakdown_select_container.value);
    
    render_hourly_analytics_graph( hourly_analytics_charts_container, data_obj, operation_name, breakdown_select_container.value);

    }
  return true;  
}

// Format chart job data as required by chart dataset variable
function convert_data_to_hourly_analytics_chart_dataset(record_list = [], operation_name, breakdown_mode = "hourly_analytics_graph_default")
{

  // Get records as per filter criteria & get hourly labels as per local time
  var filtered_data_list = [];
  var date_list = [];

  for(var i=0; i<record_list.length; i++)
    {
      if(pass_filter_criteria(record_list[i], operation_name, "hourly_analytics_filter_model", "hourly_analytics_filter_status", 
                              "hourly_analytics_filter_workstation", "hourly_analytics_filter_user", "hourly_analytics_filter_date"))
      {
        filtered_data_list.push(record_list[i]);
        var dt = decode_date(record_list[i][operation_name].log.entry_dt, 1);

        var date_label = dt.getHours() + ":00 - " + (dt.getHours()+1) + ":00";
        if(date_list.indexOf(date_label) < 0) date_list.push(date_label);
      }
    }
  
    date_list = date_list.sort(function(a, b)
    {
      const val1 = Number(a.split(":")[0]);
      const val2 = Number(b.split(":")[0]);
      return val1-val2;
    });
    var data_count = {};
    var breakdown_categories = [];

  // default breakdown view
  if(breakdown_mode == "hourly_analytics_graph_default")
  {
    // Get categories of breakdown type - eg model names, workstation names, etc
     breakdown_categories[0] = ["# of Jobs"]; 

    for(var i=0; i<breakdown_categories.length; i++)
    {
      data_count[breakdown_categories[i]] = new Array(date_list.length).fill(0)
    }

    for(var i=0; i<filtered_data_list.length; i++)
    {
      var entry_dt = decode_date(filtered_data_list[i][operation_name]["log"]["entry_dt"],1);
      var date_label = entry_dt.getHours() + ":00 - " + (entry_dt.getHours()+1) + ":00";

      var index = date_list.indexOf(date_label);

      data_count[breakdown_categories[0]][index] += 1;
    }

  }

  // model breakdown view
  if(breakdown_mode == "hourly_analytics_graph_model")
  {
    // Get categories of breakdown type - eg model names, workstation names, etc
    for(var i=0; i< filtered_data_list.length; i++)
    {
      if(breakdown_categories.indexOf(filtered_data_list[i]["Basic Info"].model) < 0 )
      {
        breakdown_categories.push(filtered_data_list[i]["Basic Info"].model);
      }

    }
    breakdown_categories = breakdown_categories.sort();


    for(var i=0; i<breakdown_categories.length; i++)
    {
      data_count[breakdown_categories[i]] = new Array(date_list.length).fill(0)
    }

    for(var i=0; i<filtered_data_list.length; i++)
    {
      var entry_dt = decode_date(filtered_data_list[i][operation_name]["log"]["entry_dt"],1);
      var date_label = entry_dt.getHours() + ":00 - " + (entry_dt.getHours()+1) + ":00";

      var index = date_list.indexOf(date_label);

      // Select category model that record belongs to
      var category = filtered_data_list[i]["Basic Info"].model;

      data_count[category][index] += 1;
    }

  }


    // status breakdown view
    if(breakdown_mode == "hourly_analytics_graph_status")
  {
    // Get categories of breakdown type - eg model names, workstation names, etc
    for(var i=0; i< filtered_data_list.length; i++)
    {
      var status = "";
      if(filtered_data_list[i][operation_name].status == 4) status = "Rejected";
      else if (filtered_data_list[i][operation_name].status == 0)
      {
        if(is_null(filtered_data_list[i][operation_name].log.deviation_by))
        status = "Completed";
        else
        status = "Completed (with deviation)";
      }
      else status = "In Progress (deviation required)";


      if(breakdown_categories.indexOf(status) < 0 )
      {
        breakdown_categories.push(status);
      }

    }
    breakdown_categories = breakdown_categories.sort();


    for(var i=0; i<breakdown_categories.length; i++)
    {
      data_count[breakdown_categories[i]] = new Array(date_list.length).fill(0)
    }

    for(var i=0; i<filtered_data_list.length; i++)
    {
      var entry_dt = decode_date(filtered_data_list[i][operation_name]["log"]["entry_dt"],1);
      var date_label = entry_dt.getHours() + ":00 - " + (entry_dt.getHours()+1) + ":00";

      var index = date_list.indexOf(date_label);

      // Select category model that record belongs to
      var category = "";
      if(filtered_data_list[i][operation_name].status == 4) category = "Rejected";
      else if (filtered_data_list[i][operation_name].status == 0)
      {
        if( is_null(filtered_data_list[i][operation_name].log.deviation_by) )
        category = "Completed";
        else
        category = "Completed (with deviation)";
      }
      else category = "In Progress (deviation required)";

      data_count[category][index] += 1;
    }

  }


  // workstation breakdown view
  if(breakdown_mode == "hourly_analytics_graph_workstation")
  {
    // Get categories of breakdown type - eg model names, workstation names, etc
    for(var i=0; i< filtered_data_list.length; i++)
    {
      if(breakdown_categories.indexOf(filtered_data_list[i][operation_name].workstation) < 0 )
      {
        breakdown_categories.push(filtered_data_list[i][operation_name].workstation);
      }

    }
    breakdown_categories = breakdown_categories.sort();


    for(var i=0; i<breakdown_categories.length; i++)
    {
      data_count[breakdown_categories[i]] = new Array(date_list.length).fill(0)
    }

    for(var i=0; i<filtered_data_list.length; i++)
    {
      var entry_dt = decode_date(filtered_data_list[i][operation_name]["log"]["entry_dt"],1);
      var date_label = entry_dt.getHours() + ":00 - " + (entry_dt.getHours()+1) + ":00";

      var index = date_list.indexOf(date_label);

      // Select category model that record belongs to
      var category = filtered_data_list[i][operation_name].workstation;

      data_count[category][index] += 1;
    }

  }


  // user id breakdown view
  if(breakdown_mode == "hourly_analytics_graph_user_id")
  {
    // Get categories of breakdown type - eg model names, workstation names, etc
    for(var i=0; i< filtered_data_list.length; i++)
    {
      if(breakdown_categories.indexOf(filtered_data_list[i][operation_name].log.entry_by) < 0 )
      {
        breakdown_categories.push(filtered_data_list[i][operation_name].log.entry_by);
      }

    }
    breakdown_categories = breakdown_categories.sort();


    for(var i=0; i<breakdown_categories.length; i++)
    {
      data_count[breakdown_categories[i]] = new Array(date_list.length).fill(0)
    }

    for(var i=0; i<filtered_data_list.length; i++)
    {
      var entry_dt = decode_date(filtered_data_list[i][operation_name]["log"]["entry_dt"],1);
      var date_label = entry_dt.getHours() + ":00 - " + (entry_dt.getHours()+1) + ":00";

      var index = date_list.indexOf(date_label);

      // Select category model that record belongs to
      var category = filtered_data_list[i][operation_name].log.entry_by;

      data_count[category][index] += 1;
    }

  }
  


  // job hours breakdown view
  if(breakdown_mode == "hourly_analytics_graph_job_hours")
  {
    // Get categories of breakdown type - eg model names, workstation names, etc
     breakdown_categories[0] = ["Job Hours Completed"]; 

    for(var i=0; i<breakdown_categories.length; i++)
    {
      data_count[breakdown_categories[i]] = new Array(date_list.length).fill(0)
    }

    for(var i=0; i<filtered_data_list.length; i++)
    {
      var entry_dt = decode_date(filtered_data_list[i][operation_name]["log"]["entry_dt"],1);
      var date_label = entry_dt.getHours() + ":00 - " + (entry_dt.getHours()+1) + ":00";

      var index = date_list.indexOf(date_label);

      data_count[breakdown_categories[0]][index] += filtered_data_list[i][operation_name]["cycle_time"] / 60;
    }

    // display job hours only till 1st integer place
    for(var i=0; i< date_list.length; i++)
    {
      data_count[breakdown_categories[0]][i] = Number(data_count[breakdown_categories[0]][i]).toFixed(1) ;
    }


  }


  // build final dataset for graph
  var dataset = [];

  for(var i=0; i< breakdown_categories.length; i++)
  {
    dataset.push({
                    label : breakdown_categories[i],
                    data : data_count[breakdown_categories[i]],
                    stack : 1,
                    backgroundColor: (i<=indexcolors.length) ? indexcolors[i] : "#4E73DF" ,
                    maxBarThickness: 60
                 })
  }

  return {
            "dataset" : dataset,
            "stack_labels" : breakdown_categories,
            "axis_labels" : date_list
         };

}

// Format chart disruption data as required by chart dataset variable
function convert_disruption_data_to_hourly_analytics_chart_dataset(disruption_record_list = [], operation_name, breakdown_mode = "hourly_analytics_graph_disruption_mins")
{

  // Get records as per filter criteria & get hourly labels as per local time
  var filtered_data_list = [];
  var date_list = [];

  for(var i=0; i<disruption_record_list.length; i++)
    {
      if(pass_disruption_filter_criteria(disruption_record_list[i], operation_name, "hourly_analytics_filter_model", "hourly_analytics_filter_status", 
                              "hourly_analytics_filter_workstation", "hourly_analytics_filter_user", "hourly_analytics_filter_date"))
      {
        filtered_data_list.push(disruption_record_list[i]);
        var dt = decode_date(disruption_record_list[i].start_time, 1);

        var date_label = dt.getHours() + ":00 - " + (dt.getHours()+1) + ":00";
        if(date_list.indexOf(date_label) < 0) date_list.push(date_label);
      }
    }
  
    date_list = date_list.sort(function(a, b)
    {
      const val1 = Number(a.split(":")[0]);
      const val2 = Number(b.split(":")[0]);
      return val1-val2;
    });
    var data_count = {};
    var breakdown_categories = [];


  // disruption minutes breakdown view
  if(breakdown_mode == "hourly_analytics_graph_disruption_mins")
  {
    // Get categories of breakdown type - eg model names, workstation names, etc
    for(var i=0; i< filtered_data_list.length; i++)
    {
      if(breakdown_categories.indexOf(filtered_data_list[i].reason) < 0 )
      {
        breakdown_categories.push(filtered_data_list[i].reason);
      }

    }
    breakdown_categories = breakdown_categories.sort();


    for(var i=0; i<breakdown_categories.length; i++)
    {
      data_count[breakdown_categories[i]] = new Array(date_list.length).fill(0)
    }

    for(var i=0; i<filtered_data_list.length; i++)
    {
      var entry_dt = decode_date(filtered_data_list[i].start_time,1);
      var date_label = entry_dt.getHours() + ":00 - " + (entry_dt.getHours()+1) + ":00";

      var index = date_list.indexOf(date_label);

      // Select category model that record belongs to
      var category = filtered_data_list[i].reason;

      var disruption_minutes =  (decode_date(filtered_data_list[i].end_time|| new Date(),1) - decode_date(filtered_data_list[i].start_time,1)) / (1000 * 60);
      disruption_minutes = Math.round(disruption_minutes); // save number to 1 decimal place only

      data_count[category][index] += disruption_minutes;
    }

  }
  

  // disruption count breakdown view
  if(breakdown_mode == "hourly_analytics_graph_disruption_count")
  {
    // Get categories of breakdown type - eg model names, workstation names, etc
    for(var i=0; i< filtered_data_list.length; i++)
    {
      if(breakdown_categories.indexOf(filtered_data_list[i].reason) < 0 )
      {
        breakdown_categories.push(filtered_data_list[i].reason);
      }

    }
    breakdown_categories = breakdown_categories.sort();


    for(var i=0; i<breakdown_categories.length; i++)
    {
      data_count[breakdown_categories[i]] = new Array(date_list.length).fill(0)
    }

    for(var i=0; i<filtered_data_list.length; i++)
    {
      var entry_dt = decode_date(filtered_data_list[i].start_time,1);
      var date_label = entry_dt.getHours() + ":00 - " + (entry_dt.getHours()+1) + ":00";

      var index = date_list.indexOf(date_label);

      // Select category model that record belongs to
      var category = filtered_data_list[i].reason;

      data_count[category][index] += 1;
    }

  }



  // build final dataset for graph
  var dataset = [];

  for(var i=0; i< breakdown_categories.length; i++)
  {
    dataset.push({
                    label : breakdown_categories[i],
                    data : data_count[breakdown_categories[i]],
                    stack : 1,
                    backgroundColor: (i<=indexcolors.length) ? indexcolors[i] : "#4E73DF" ,
                    maxBarThickness: 60
                 })
  }

  return {
            "dataset" : dataset,
            "stack_labels" : breakdown_categories,
            "axis_labels" : date_list
         };

}

function render_hourly_analytics_graph( chart_container, data_obj , operation_name,  breakdown_mode = "hourly_analytics_graph_default")
{

  chart_data = data_obj.dataset;
  chart_labels =  data_obj.axis_labels;

  var chart_title = "Number of Jobs Per Hour (" + operation_name + ")";
  if(breakdown_mode == "hourly_analytics_graph_job_hours") chart_title = "Total Cycle Time of Jobs Processed per Hour (hours)";
  if(breakdown_mode == "hourly_analytics_graph_disruption_mins") chart_title = "Disruptions Reported for " + operation_name + " (minutes)";
  if(breakdown_mode == "hourly_analytics_graph_disruption_count") chart_title = "# Disruptions Reported for " + operation_name;

  empty_container_byReference(chart_container);
  var canvas = document.createElement('canvas');
  canvas.id = "hourly_analytics_charts_canvas";
  chart_container.appendChild(canvas);
  var ctx = canvas.getContext('2d');
    
  var formatted_chart_labels = [];
    // Split labels into multiple lines if too long             
    for(var i=0; i< chart_labels.length; i++)   formatted_chart_labels[i] = formatLabel(chart_labels[i]);


  var chart_options = {
                          responsive:true,
                          maintainAspectRatio:false,
                          scales: {
                                    xAxes: [{ stacked: true,
                                              scaleLabel: 
                                              {
                                                display: true,
                                                labelString: chart_title
                                              }      
                                            }],
                                    yAxes: [{ gridLines: { display:false},
                                              stacked: true, barThickness: 'flex', }]
                                  },
                          legend: {
                                    display: true
                                  }
                        }

  var myChart = new Chart(ctx, {
                                    type: 'bar',
                                    data: {
                                            labels: formatted_chart_labels,
                                            datasets: chart_data
                                          },
                                    options: chart_options
                                });

}



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                        Display WIP Inventory Analytics - sub section of Dashboard                             //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////     

//Function to initialize WIP Inventory analytics section

async function initialize_wip_inventory_analytics_section()
{
  await reset_sections();
  var wip_inventory_model_seclect_container = document.getElementById("wip_inventory_analytics_model_select");
  empty_container_byReference(wip_inventory_model_seclect_container);
  document.getElementById("wip_inventory_analytics_main_content").style.display = "none";

  if( is_null(gl_model_list) )
  gl_model_list = await read_model_list();

  set_select_options(wip_inventory_model_seclect_container,gl_model_list.sort())


  fetch_wip_inventory_analytics_data_btn.onclick = async function(){

    const model_name = wip_inventory_model_seclect_container.value;

    try{
      start_loading();  
      const download_wip_inventory_analytics_data = functions.httpsCallable('download_wip_invenotry_analytics_data');
      const fetched_data = (await download_wip_inventory_analytics_data({"model_type" : model_name})).data;
      console.log(fetched_data);
      gl_analytics_records_list = fetched_data;

      var table_container = document.getElementById("wip_inventory_analytics_job_records_table_container");
          empty_container_byReference(table_container);
          let table = document.createElement("table");
          table.className="table table-responsive table-striped table-bordered wrap display stripe row-border";
          table.style = "width:100%";
          table.id = "wip_inventory_analytics_table";
          table_container.appendChild(table);
  
  
      process_wip_inventory_analytics_data(gl_analytics_records_list, model_name);
      render_table_job_records(gl_analytics_records_list, "wip_inventory_analytics_table");
  
      document.getElementById("wip_inventory_analytics_main_content").style.display = "block";
  
      stop_loading();
      }
      catch(error)
      {
        display_error(error.message);
        return false;
      }

  }
}



function process_wip_inventory_analytics_data(wip_inventory_records_list, model_name)
{ 
  var operation_id_list = [];

  // Get all available options of operations present
  for(var i=0; i< wip_inventory_records_list.length; i++)
  {
    operation_id_list = operation_id_list.concat(wip_inventory_records_list[i]["Basic Info"].op_order);
  }

  //Keep only unique options
  operation_id_list = Array.from(new Set(operation_id_list));


  var wip_inventory_analytics_charts_container = document.getElementById("wip_inventory_charts_container");
  wip_inventory_analytics_charts_container.style.height = (50) + "vh";

  var data_obj = convert_data_to_wip_inventory_analytics_chart_dataset(wip_inventory_records_list, operation_id_list);
  render_wip_inventory_analytics_graph( wip_inventory_charts_container, data_obj, model_name);

return true;
}


// Format chart disruption data as required by chart dataset variable
function convert_data_to_wip_inventory_analytics_chart_dataset(wip_inventory_record_list = [], operation_id_list)
{

  // Get disruption records as per filter criteria & get daily date labels as per local time
  var filtered_data_list = wip_inventory_record_list;
  var operation_name_list = [];

  for(var i=0; i<operation_id_list.length; i++)
    {
        if(gl_user_permission.admin == 1 || gl_user_permission[operation_id_list[i]] >= 1)
        {
          operation_name_list.push(operation_id_list[i]);
        }
    }

    operation_name_list.push("Ready for Dispatch");

    //Keep only unique options
    operation_name_list = Array.from(new Set(operation_name_list));

  
    var data_count = {};
    var breakdown_categories = [status_list[2],status_list[1],status_list[3]];


    for(var i=0; i<breakdown_categories.length; i++)
    {
      data_count[breakdown_categories[i]] = new Array(operation_name_list.length).fill(0)
    }

    for(var i=0; i<filtered_data_list.length; i++)
    {
      var pending_op = filtered_data_list[i]["Basic Info"]["pending_op"];
      if(pending_op == ".") pending_op = "Ready for Dispatch";

      var index = operation_name_list.indexOf(pending_op);
      console.log(index);


      // Select operation status category that record belongs to 
      
      var status = (filtered_data_list[i][pending_op] == undefined) ? 2 : filtered_data_list[i][pending_op]["status"];
      var category = status_list[status] ;

      data_count[category][index] += 1;
    }



  // build final dataset for graph
  var dataset = [];

  for(var i=0; i< breakdown_categories.length; i++)
  {
    dataset.push({
                    label : breakdown_categories[i],
                    data : data_count[breakdown_categories[i]],
                    stack : 1,
                    backgroundColor: (i<=indexcolors.length) ? indexcolors[i] : "#4E73DF" ,
                    maxBarThickness: 60,
                    barThickness: 'flex',
                 })
  }

  return {
            "dataset" : dataset,
            "stack_labels" : breakdown_categories,
            "axis_labels" : operation_name_list
         };

}


function render_wip_inventory_analytics_graph( chart_container, data_obj, model_name)
{

  chart_data = data_obj.dataset;
  chart_labels =  data_obj.axis_labels;

  var chart_title = model_name + " - Work In Progress Inventory Status";
 
  empty_container_byReference(chart_container);
  var canvas = document.createElement('canvas');
  canvas.id = "wip_inventory_analytics_charts_canvas";
  chart_container.appendChild(canvas);
  var ctx = canvas.getContext('2d');
    
  var formatted_chart_labels = [];
    // Split labels into multiple lines if too long             
    for(var i=0; i< chart_labels.length; i++)   formatted_chart_labels[i] = formatLabel(chart_labels[i]);


  var chart_options = {
                          responsive:true,
                          maintainAspectRatio:false,
                          scales: {
                                    xAxes: [{ stacked: true,
                                              scaleLabel: 
                                              {
                                                display: true,
                                                labelString: chart_title
                                              }      
                                            }],
                                    yAxes: [{ gridLines: { display:false},
                                              stacked: true, barThickness: 'flex', }]
                                  },
                          legend: {
                                    display: true
                                  }
                        }

  var myChart = new Chart(ctx, {
                                    type: 'horizontalBar',
                                    data: {
                                            labels: formatted_chart_labels,
                                            datasets: chart_data
                                          },
                                    options: chart_options
                                });

}




////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                        Display Process Disruption Analytics - sub section of Dashboard                             //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////     

//Function to initialize process disruption analytics section

async function initialize_process_disruption_analytics_section()
{
  reset_sections();

  document.getElementById("process_disruption_analytics_start_datepicker").value = "";
  document.getElementById("process_disruption_analytics_end_datepicker").value = "";
  document.getElementById("process_disruption_analytics_main_content").style.display = "none";
  document.getElementById("process_disruption_analytics_breakdown_select").value = "disruption_analytics_graph_disruption_count";

  $('#process_disruption_analytics_start_datepicker').datepicker({ uiLibrary: 'bootstrap4'  });
  $('#process_disruption_analytics_end_datepicker').datepicker({ uiLibrary: 'bootstrap4'  });


  fetch_process_disruption_analytics_data_btn.onclick = async function(){

    var start_date = document.getElementById("process_disruption_analytics_start_datepicker").value;
    var end_date = document.getElementById("process_disruption_analytics_end_datepicker").value;

    if (is_null(start_date) || is_null(end_date) ) 
    {
      display_error("Please select start and end date before fetching data");
      return false;
    }
    else
    {
      start_date = new Date(start_date);
      end_date = new Date(end_date);
    }

    if(end_date - start_date < 0)
    {
      display_error("End Date should be greater than or same as Start Date");
      return false;
    }

    if(gl_user_permission.admin != 1 && gl_user_permission[section_permission_list["View Dashboard"]] != 1 )
    {
      display_error("You do not have sufficient permissions for this operation. Please contact your admin.");
      return false;
    }

    // set start and end times of dates & get timestamps
    start_date.setHours(0); start_date.setMinutes(0); start_date.setSeconds(0);
    end_date.setHours(23); end_date.setMinutes(59); end_date.setSeconds(59);

    const start_dt = firebase.firestore.Timestamp.fromDate(start_date);
    const end_dt = firebase.firestore.Timestamp.fromDate(end_date);


    try
    {
      start_loading();

      const download_disruption_analytics_data = functions.httpsCallable('download_disruption_analytics_data');
      const fetched_data = (await download_disruption_analytics_data({"start_date" : start_dt, "end_date" : end_dt})).data;

//      var fetched_data = await get_disruption_data();

      // remove records for operations where user does not have atleast "read" permission (1 - read, 2 - write, etc) from operation_names array
      var temp_array = [];
      gl_analytics_disruption_records_list = [];
      for(var i=0; i< fetched_data.length; i++)
      {
          if(gl_user_permission.admin == 1 || gl_user_permission[fetched_data[i].operation] >=1)
          temp_array.push(fetched_data[i]);
      }
      gl_analytics_disruption_records_list = temp_array;
    
        var table_container = document.getElementById("process_disruption_analytics_table_container");
            empty_container_byReference(table_container);
            let table = document.createElement("table");
            table.className="table table-responsive table-striped table-bordered wrap display stripe row-border";
            table.style = "width:100%";
            table.id = "process_disruption_analytics_table";
            table_container.appendChild(table);
    
    
        process_disruption_analytics_data(gl_analytics_disruption_records_list);
        render_table_disruption_records(gl_analytics_disruption_records_list, "process_disruption_analytics_table");
    
        document.getElementById("process_disruption_analytics_main_content").style.display = "block";
    
        var process_disruption_analytics_breakdown_select = document.getElementById("process_disruption_analytics_breakdown_select");
        process_disruption_analytics_breakdown_select.onchange=function() {    process_disruption_analytics_data(gl_analytics_disruption_records_list);}
    
        stop_loading();
    }
    catch(error)
    {
      display_error(error.message);
      return false;
    }

  }
}


function process_disruption_analytics_data(disruption_records_list)
{ 
  var operation_id_list = [];

  // Get all available options of operations present
  for(var i=0; i< disruption_records_list.length; i++)
  {
    operation_id_list.push(disruption_records_list[i].operation);
  }

  //Keep only unique options
  operation_id_list = Array.from(new Set(operation_id_list)).sort();


  var process_disruption_analytics_charts_container = document.getElementById("process_disruption_analytics_charts_container");
  process_disruption_analytics_charts_container.style.height = (50) + "vh";

  var breakdown_select_container = document.getElementById("process_disruption_analytics_breakdown_select");

  var data_obj = convert_data_to_disruption_analytics_chart_dataset(disruption_records_list, breakdown_select_container.value);
  render_disruption_analytics_graph( process_disruption_analytics_charts_container, data_obj, breakdown_select_container.value);

  breakdown_select_container.onchange = function(){

    
    var data_obj = {};
    data_obj = convert_data_to_disruption_analytics_chart_dataset(disruption_records_list, breakdown_select_container.value);

    render_disruption_analytics_graph( process_disruption_analytics_charts_container, data_obj, breakdown_select_container.value);

  }

return true;
}


// Format chart disruption data as required by chart dataset variable
function convert_data_to_disruption_analytics_chart_dataset(disruption_record_list = [], breakdown_mode = "daily_analytics_graph_disruption_count")
{

  // Get disruption records as per filter criteria & get daily date labels as per local time
  var filtered_data_list = [];
  var operation_name_list = [];

  for(var i=0; i<disruption_record_list.length; i++)
    {
        filtered_data_list.push(disruption_record_list[i]);

        var operation_label = disruption_record_list[i].operation;
        if(operation_name_list.indexOf(operation_label) < 0) operation_name_list.push(operation_label);
    }
  
    var data_count = {};
    var breakdown_categories = [];



  // disruption hours breakdown view
  if(breakdown_mode == "disruption_analytics_graph_disruption_mins")
  {
    // Get categories of breakdown type - eg model names, workstation names, etc
    for(var i=0; i< filtered_data_list.length; i++)
    {
      if(breakdown_categories.indexOf(filtered_data_list[i].reason) < 0 )
      {
        breakdown_categories.push(filtered_data_list[i].reason);
      }

    }
    breakdown_categories = breakdown_categories.sort();


    for(var i=0; i<breakdown_categories.length; i++)
    {
      data_count[breakdown_categories[i]] = new Array(operation_name_list.length).fill(0)
    }

    for(var i=0; i<filtered_data_list.length; i++)
    {
      var index = operation_name_list.indexOf(filtered_data_list[i].operation);

      // Select category model that record belongs to
      var category = filtered_data_list[i].reason;

      var disruption_minutes =  (decode_date(filtered_data_list[i].end_time|| new Date(),1) - decode_date(filtered_data_list[i].start_time,1)) / (1000 * 60);

      disruption_minutes = Math.round(disruption_minutes); 

      data_count[category][index] += disruption_minutes;
    }

  }



  // disruption hours breakdown view
  if(breakdown_mode == "disruption_analytics_graph_disruption_count")
  {
    // Get categories of breakdown type - eg model names, workstation names, etc
    for(var i=0; i< filtered_data_list.length; i++)
    {
      if(breakdown_categories.indexOf(filtered_data_list[i].reason) < 0 )
      {
        breakdown_categories.push(filtered_data_list[i].reason);
      }

    }
    breakdown_categories = breakdown_categories.sort();


    for(var i=0; i<breakdown_categories.length; i++)
    {
      data_count[breakdown_categories[i]] = new Array(operation_name_list.length).fill(0)
    }

    for(var i=0; i<filtered_data_list.length; i++)
    {
      var index = operation_name_list.indexOf(filtered_data_list[i].operation);

      // Select category model that record belongs to
      var category = filtered_data_list[i].reason;

      data_count[category][index] += 1;
    }

  }


  // build final dataset for graph
  var dataset = [];

  for(var i=0; i< breakdown_categories.length; i++)
  {
    dataset.push({
                    label : breakdown_categories[i],
                    data : data_count[breakdown_categories[i]],
                    stack : 1,
                    backgroundColor: (i<=indexcolors.length) ? indexcolors[i] : "#4E73DF" ,
                    maxBarThickness: 60,
                    barThickness: 'flex',
                 })
  }

  return {
            "dataset" : dataset,
            "stack_labels" : breakdown_categories,
            "axis_labels" : operation_name_list
         };

}


function render_disruption_analytics_graph( chart_container, data_obj,  breakdown_mode = "disruption_analytics_graph_disruption_count")
{

  chart_data = data_obj.dataset;
  chart_labels =  data_obj.axis_labels;

  var chart_title = "Number of Disruptions Reported for each Operation";
 
  if(breakdown_mode== "disruption_analytics_graph_disruption_mins")
  chart_title = "Total Disruption Time for each Operation (minutes)"

  empty_container_byReference(chart_container);
  var canvas = document.createElement('canvas');
  canvas.id = "disruptions_analytics_charts_canvas";
  chart_container.appendChild(canvas);
  var ctx = canvas.getContext('2d');
    
  var formatted_chart_labels = [];
    // Split labels into multiple lines if too long             
    for(var i=0; i< chart_labels.length; i++)   formatted_chart_labels[i] = formatLabel(chart_labels[i]);


  var chart_options = {
                          responsive:true,
                          maintainAspectRatio:false,
                          scales: {
                                    xAxes: [{ stacked: true,
                                              scaleLabel: 
                                              {
                                                display: true,
                                                labelString: chart_title
                                              }      
                                            }],
                                    yAxes: [{ gridLines: { display:false},
                                              stacked: true, barThickness: 'flex', }]
                                  },
                          legend: {
                                    display: true
                                  }
                        }

  var myChart = new Chart(ctx, {
                                    type: 'bar',
                                    data: {
                                            labels: formatted_chart_labels,
                                            datasets: chart_data
                                          },
                                    options: chart_options
                                });

}


// Function to render table with complete record data - Used in download job records & realtime analytics & daily / hourly operation analytics
function render_table_disruption_records(disruption_record_array, table_id, selected_operation_list = [])
{
  var operation_names = [];

  // If selected_operation_list is provided, use only those operations for table
  if(!is_null(selected_operation_list) )
  {
    operation_names = selected_operation_list;
  }
  else
  {
    // Else get all operation names across all records
    for(var i=0; i<disruption_record_array.length; i++)
    {
      operation_names.push(disruption_record_array[i].operation)
    }
  }

  operation_names = Array.from(new Set(operation_names));

 
  // create table
  let table = document.getElementById(table_id);

  let table_header = document.createElement("thead");
  let header_row = document.createElement("tr");


  let th_reason = document.createElement("th");
  th_reason.innerText = "Disruption Reason"; 
  header_row.appendChild(th_reason);

  let th_operation = document.createElement("th");
  th_operation.innerText = "Operation"; 
  header_row.appendChild(th_operation);

  let th_workstation = document.createElement("th");
  th_workstation.innerText = "Workstation"; 
  header_row.appendChild(th_workstation);

  let th_remark = document.createElement("th");
  th_remark.innerText = "Remark"; 
  header_row.appendChild(th_remark);

  let th_down_time = document.createElement("th");
  th_down_time.innerText = "Total Down Time (Minutes)"; 
  header_row.appendChild(th_down_time);

  let th_reported_by = document.createElement("th");
  th_reported_by.innerText = "Reported By"; 
  header_row.appendChild(th_reported_by);

  let th_start_time = document.createElement("th");
  th_start_time.innerText = "Start Time"; 
  header_row.appendChild(th_start_time);

  let th_resolved_by = document.createElement("th");
  th_resolved_by.innerText = "Resolved By"; 
  header_row.appendChild(th_resolved_by);

  let th_end_time = document.createElement("th");
  th_end_time.innerText = "End Time"; 
  header_row.appendChild(th_end_time);

  table_header.appendChild(header_row);
  // End of table header generation section


  let table_body = document.createElement("tbody");
  table_body.className = "text-break";

  // Add values for each row
  for(var i=0; i<disruption_record_array.length; i++)
  {
    let body_row = document.createElement("tr");

    let td_reason = document.createElement("td");
    td_reason.innerText = disruption_record_array[i].reason; 
    body_row.appendChild(td_reason);

    let td_operation = document.createElement("td");
    td_operation.innerText = disruption_record_array[i].operation; 
    body_row.appendChild(td_operation);

    let td_workstation = document.createElement("td");
    td_workstation.innerText = disruption_record_array[i].workstation; 
    body_row.appendChild(td_workstation);
     
    let td_remark = document.createElement("td");
    td_remark.innerText = disruption_record_array[i].remark; 
    body_row.appendChild(td_remark);

    let td_down_time = document.createElement("td");
    td_down_time.innerText = ((decode_date(disruption_record_array[i].end_time || new Date(),1) - decode_date(disruption_record_array[i].start_time,1))/(1000*60)).toFixed(1)  || "-"; 
    body_row.appendChild(td_down_time);
 
    let td_reported_by = document.createElement("td");
    td_reported_by.innerText = disruption_record_array[i].start_user || "-"; 
    body_row.appendChild(td_reported_by);

    let td_start_time = document.createElement("td");
    td_start_time.innerText = decode_date(disruption_record_array[i].start_time) || "-"; 
    body_row.appendChild(td_start_time);

    let td_resolved_by = document.createElement("td");
    td_resolved_by.innerText = disruption_record_array[i].end_user || "-"; 
    body_row.appendChild(td_resolved_by);

    let td_end_time = document.createElement("td");
    td_end_time.innerText = decode_date(disruption_record_array[i].end_time) || "-"; 
    body_row.appendChild(td_end_time);

    table_body.appendChild(body_row);

  } 
  // End of table body generation section

table.appendChild(table_header);
table.appendChild(table_body);

  $("#"+ table_id).DataTable( {
                                              "lengthMenu": [[10, 25, 50, -1], [10, 25, 50, "All"]],
                                              "lengthChange": true,
                                              "columnDefs": [
                                                              { targets: '_all', visible: true,  "width": "150px" }
                                                            ],
                                              "colReorder": true,
                                              "fixedColumns":   {leftColumns: 2},
                                              "paging": true,
                                              "dom": '<"row"<"col-sm-12 p-2"Bf>><t><"row"<"col-sm-4 mb-2 mt-2 text-left"l><"col-sm-4 mb-2 text-center"i><"col-sm-4 text-right mb-2"p>>',
                                              "buttons": [
                                                          "searchBuilder",
                                                          {
                                                            extend: 'collection',
                                                            text: 'Export Data',
                                                            buttons: ['copy','excel','csv']
                                                          },                                                          
                                                         ]
                                             });
return true;
}



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                        Display Maintenance history Analytics - sub section of Dashboard                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////     

//Function to initialize maintenance history analytics section
async function initialize_maintenance_history_analytics_section()
{
  await reset_sections();

  document.getElementById("maintenance_history_report_start_datepicker").value = "";
  document.getElementById("maintenance_history_report_end_datepicker").value = "";
  document.getElementById("maintenance_history_report_main_content").style.display = "none";

  $('#maintenance_history_report_start_datepicker').datepicker({ uiLibrary: 'bootstrap4'  });
  $('#maintenance_history_report_end_datepicker').datepicker({ uiLibrary: 'bootstrap4'  });


  fetch_maintenance_history_report_data_btn.onclick = async function(){

    var start_date = document.getElementById("maintenance_history_report_start_datepicker").value;
    var end_date = document.getElementById("maintenance_history_report_end_datepicker").value;

    if (is_null(start_date) || is_null(end_date) ) 
    {
      display_error("Please select start and end date before fetching data");
      return false;
    }
    else
    {
      start_date = new Date(start_date);
      end_date = new Date(end_date);
    }

    if(end_date - start_date < 0)
    {
      display_error("End Date should be greater than or same as Start Date");
      return false;
    }

    if(gl_user_permission.admin != 1 &&  gl_user_permission[section_permission_list["View Dashboard"]] != 1 )
    {
      display_error("You do not have sufficient permissions for this operation. Please contact your admin.");
      return false;
    }

    // set start and end times of dates & get timestamps
    start_date.setHours(0); start_date.setMinutes(0); start_date.setSeconds(0);
    end_date.setHours(23); end_date.setMinutes(59); end_date.setSeconds(59);

    // get number of days to calculate mtbf
    const period = (new Date(end_date) - new Date(start_date))/(1000*60*60*24);

    const start_dt = firebase.firestore.Timestamp.fromDate(start_date);
    const end_dt = firebase.firestore.Timestamp.fromDate(end_date);


    try
    {
      start_loading();

      const download_maintenance_history_data = functions.httpsCallable('download_maintenance_history_data');
      const fetched_data = (await download_maintenance_history_data({"start_date" : start_dt, "end_date" : end_dt})).data;

//      var fetched_data = await get_maintenance_data();

      // Filter records as per user permission
      const temp_maintenance_list = fetched_data.maintenance_records;
      const temp_disruption_list = fetched_data.disruption_records;
  
      gl_anlytics_maintenance_records_list = [];
      gl_analytics_disruption_records_list = [];
  
      for(var i=0; i<temp_maintenance_list.length; i++)
      {
        const op_name = get_operation_name_from_workstation_id(temp_maintenance_list[i].workstation);
  
        if(gl_user_permission.admin == 1 || gl_user_permission[op_name] >=1)
        gl_anlytics_maintenance_records_list.push(temp_maintenance_list[i]);
      }
  
      for(var i=0; i<temp_disruption_list.length; i++)
      {
        const op_name = temp_disruption_list[i].operation;
  
        if(gl_user_permission.admin == 1 || gl_user_permission[op_name] >=1)
        gl_analytics_disruption_records_list.push(temp_disruption_list[i]);
      }
  
      var table_container = document.getElementById("maintenance_records_table_container");
          empty_container_byReference(table_container);
          let table = document.createElement("table");
          table.className="table table-responsive table-striped table-bordered wrap display stripe row-border";
          table.style = "width:100%";
          table.id = "maintenance_records_table";
          table_container.appendChild(table);
  
      var maintenance_count_operation_breakdown_select = document.getElementById("maintenance_count_operation_breakdown_select");
      var maintenance_mtbf_operation_breakdown_select = document.getElementById("maintenance_mtbf_operation_breakdown_select");
      empty_container_byReference(maintenance_count_operation_breakdown_select);
      empty_container_byReference(maintenance_mtbf_operation_breakdown_select);
  
      process_maintenance_history_chart_data(gl_anlytics_maintenance_records_list, gl_analytics_disruption_records_list, period);
      render_table_maintenance_records(gl_anlytics_maintenance_records_list, "maintenance_records_table");
  
      document.getElementById("maintenance_history_report_main_content").style.display = "block";
  
      maintenance_count_operation_breakdown_select.onchange=function() 
      {   
        maintenance_mtbf_operation_breakdown_select.value = maintenance_count_operation_breakdown_select.value;
        process_maintenance_history_chart_data(gl_anlytics_maintenance_records_list, gl_analytics_disruption_records_list, period);
      }
      maintenance_mtbf_operation_breakdown_select.onchange=function() 
      {    
        maintenance_count_operation_breakdown_select.value = maintenance_mtbf_operation_breakdown_select.value;
        process_maintenance_history_chart_data(gl_anlytics_maintenance_records_list, gl_analytics_disruption_records_list, period);
      }
  
      stop_loading();
    }
    catch(error)
    {
      display_error(error.message);
      return false;
    }

  }
}


function process_maintenance_history_chart_data(maintenance_records_list, disruption_records_list, period)
{

  var workstation_id_list = [];
  var operation_id_list = [];

  // Get list of Workstation IDs from maintenance & disruption records
  for(var i=0; i<maintenance_records_list.length; i++)
  {
    workstation_id_list.push(maintenance_records_list[i].workstation);
  }
  for(var i=0; i<disruption_records_list.length; i++)
  {
    workstation_id_list.push(disruption_records_list[i].workstation + " (" + disruption_records_list[i].operation + ")");
  }

  workstation_id_list = Array.from(new Set(workstation_id_list));

  // Get list of Operations from workstation_id_list
  for(var i=0; i<workstation_id_list.length; i++)
  {
    const operation_name =  get_operation_name_from_workstation_id(workstation_id_list[i]);
    operation_id_list.push(operation_name);
  }
    
  operation_id_list = Array.from(new Set(operation_id_list));

  // Populate operation list for select in workstation id graph section
  var maintenance_count_operation_breakdown_select = document.getElementById("maintenance_count_operation_breakdown_select");
  var maintenance_mtbf_operation_breakdown_select = document.getElementById("maintenance_mtbf_operation_breakdown_select");

  if(maintenance_count_operation_breakdown_select.value == "" || maintenance_mtbf_operation_breakdown_select.value == "")
  {
    empty_container_byReference(maintenance_count_operation_breakdown_select);
    empty_container_byReference(maintenance_mtbf_operation_breakdown_select);

    set_select_options(maintenance_count_operation_breakdown_select, operation_id_list);
    set_select_options(maintenance_mtbf_operation_breakdown_select, operation_id_list);
  }

    // Get workstations for selected operation
  var current_chosen_operation_for_workstation_count =  maintenance_count_operation_breakdown_select.value;
  var current_chosen_operation_for_workstation_mtbf = maintenance_mtbf_operation_breakdown_select.value;

  var selected_count_workstation_list_by_operation = [];
  var selected_mtbf_workstation_list_by_operation = [];

  for(var i=0; i<workstation_id_list.length; i++)
  {
    const workstation_operation_name = get_operation_name_from_workstation_id(workstation_id_list[i]);

    if(current_chosen_operation_for_workstation_count == workstation_operation_name)
    selected_count_workstation_list_by_operation.push(workstation_id_list[i]);

    if(current_chosen_operation_for_workstation_mtbf == workstation_operation_name)
    selected_mtbf_workstation_list_by_operation.push(workstation_id_list[i]);    
  }


  // Initialize chart data sets with zeroes
  var maintenance_by_operation_count_data =   {
                                                "Preventive Maintenance" : new Array(operation_id_list.length).fill(0),
                                                "Corrective Maintenance" : new Array(operation_id_list.length).fill(0) 
                                              };

  var maintenance_by_operation_mtbf_data =    {
                                                "MTBF in Days" : new Array(operation_id_list.length).fill(0)
                                              };

  var maintenance_by_workstation_count_data = {
                                                "Preventive Maintenance" : new Array(selected_count_workstation_list_by_operation.length).fill(0),
                                                "Corrective Maintenance" : new Array(selected_count_workstation_list_by_operation.length).fill(0) 
                                              };

  var maintenance_by_workstation_mtbf_data =  {
                                                "MTBF in Days" : new Array(selected_mtbf_workstation_list_by_operation.length).fill(0)
                                              };                                          

    // Calculate maintenance count by operation & workstation
  for(var i=0; i<maintenance_records_list.length; i++ )
  {
    var workstation_id = maintenance_records_list[i].workstation;
    var operation_id = get_operation_name_from_workstation_id(maintenance_records_list[i].workstation);

      if(maintenance_records_list[i].type == "Preventive")
    {
      maintenance_by_operation_count_data["Preventive Maintenance"][operation_id_list.indexOf(operation_id)]+=1;
      maintenance_by_workstation_count_data["Preventive Maintenance"][selected_count_workstation_list_by_operation.indexOf(workstation_id)]+=1;
    }
    else
    {
      maintenance_by_operation_count_data["Corrective Maintenance"][operation_id_list.indexOf(operation_id)]+=1;
      maintenance_by_workstation_count_data["Corrective Maintenance"][selected_count_workstation_list_by_operation.indexOf(workstation_id)]+=1;
    }

  }                                            

    // Calculate failure count by operation & workstation
    for(var i=0; i<disruption_records_list.length; i++ )
  {
    var workstation_id = disruption_records_list[i].workstation + " (" + disruption_records_list[i].operation + ")";
    var operation_id = disruption_records_list[i].operation;

      maintenance_by_operation_mtbf_data["MTBF in Days"][operation_id_list.indexOf(operation_id)]+=1;
      maintenance_by_workstation_mtbf_data["MTBF in Days"][selected_mtbf_workstation_list_by_operation.indexOf(workstation_id)]+=1;

  }               

  //Calculate MTBF
  for(var i=0; i<maintenance_by_operation_mtbf_data["MTBF in Days"].length; i++ )
  {
    if(maintenance_by_operation_mtbf_data["MTBF in Days"][i] == 0 )  maintenance_by_operation_mtbf_data["MTBF in Days"][i] = period;  // if no disruption then mtbf id equal to entire period
    else maintenance_by_operation_mtbf_data["MTBF in Days"][i] = (period / maintenance_by_operation_mtbf_data["MTBF in Days"][i]).toFixed(1);    // else mtbf = period / no. of disruptions
  }

  for(var i=0; i<maintenance_by_workstation_mtbf_data["MTBF in Days"].length; i++ )
  {
    if(maintenance_by_workstation_mtbf_data["MTBF in Days"][i] == 0 )  maintenance_by_workstation_mtbf_data["MTBF in Days"][i] = period;  // if no disruption then mtbf id equal to entire period
    else maintenance_by_workstation_mtbf_data["MTBF in Days"][i] = (period / maintenance_by_workstation_mtbf_data["MTBF in Days"][i]).toFixed(1);    // else mtbf = period / no. of disruptions
  }
  console.log(maintenance_by_workstation_mtbf_data["MTBF in Days"]);


// Setup chart container & properties of maintenance charts (By operation & By workstation)

var maintenance_count_by_operation_container = document.getElementById("maintenance_count_by_operation_charts_container");
maintenance_count_by_operation_container.style.height = (operation_id_list.length * 10 + 12) + "vh";
empty_container_byReference(maintenance_count_by_operation_container);
var canvas = document.createElement('canvas');
canvas.id = "maintenance_count_by_operation_chart";
maintenance_count_by_operation_container.appendChild(canvas);

var maintenance_mtbf_by_operation_container = document.getElementById("maintenance_mtbf_by_operation_charts_container");
maintenance_mtbf_by_operation_container.style.height = (operation_id_list.length * 10 + 12) + "vh";
empty_container_byReference(maintenance_mtbf_by_operation_container);
canvas = document.createElement('canvas');
canvas.id = "maintenance_mtbf_by_operation_chart";
maintenance_mtbf_by_operation_container.appendChild(canvas);

var maintenance_count_by_workstation_container = document.getElementById("maintenance_count_by_workstation_charts_container");
maintenance_count_by_workstation_container.style.height = (selected_count_workstation_list_by_operation.length * 10 + 12) + "vh";
empty_container_byReference(maintenance_count_by_workstation_container);
canvas = document.createElement('canvas');
canvas.id = "maintenance_count_by_workstation_chart";
maintenance_count_by_workstation_container.appendChild(canvas);

var maintenance_mtbf_by_workstation_container = document.getElementById("maintenance_mtbf_by_workstation_charts_container");
maintenance_mtbf_by_workstation_container.style.height = (selected_mtbf_workstation_list_by_operation.length * 10 + 12) + "vh";
empty_container_byReference(maintenance_mtbf_by_workstation_container);
canvas = document.createElement('canvas');
canvas.id = "maintenance_mtbf_by_workstation_chart";
maintenance_mtbf_by_workstation_container.appendChild(canvas);

// Render all charts
render_maintenance_chart(operation_id_list, convert_maintenance_data_to_chart_dataset(maintenance_by_operation_count_data), 'maintenance_count_by_operation_chart', "Count of Maintenance Work Done" );
render_maintenance_chart(operation_id_list, convert_maintenance_data_to_chart_dataset(maintenance_by_operation_mtbf_data), 'maintenance_mtbf_by_operation_chart', "Mean Time Between Failure (in Days)" );
render_maintenance_chart(selected_count_workstation_list_by_operation, convert_maintenance_data_to_chart_dataset(maintenance_by_workstation_count_data), 'maintenance_count_by_workstation_chart', "Count of Maintenance Work Done" );
render_maintenance_chart(selected_mtbf_workstation_list_by_operation, convert_maintenance_data_to_chart_dataset(maintenance_by_workstation_mtbf_data), 'maintenance_mtbf_by_workstation_chart', "Mean Time Between Failure (in Days)" );
}


function render_maintenance_chart(chart_labels,chart_data, chart_id, chart_title)
{
    var formatted_chart_labels = [];
    // Split labels into multiple lines if too long             
    for(var i=0; i< chart_labels.length; i++)   formatted_chart_labels[i] = formatLabel(chart_labels[i]);


    var chart_options = {
                          responsive:true,
                          maintainAspectRatio:false,
                          scales: {
                                    xAxes: [{ stacked: true,
                                              scaleLabel: 
                                              {
                                                display: true,
                                                labelString: chart_title
                                              }      
                                            }],
                                    yAxes: [{ gridLines: { display:false},
                                              stacked: true, }]
                                  },
                          legend: {
                                    display: true
                                  }
                        }


    var ctx = document.getElementById(chart_id).getContext('2d');

    var myChart = new Chart(ctx, {
                                    type: 'horizontalBar',
                                    data: {
                                            labels: formatted_chart_labels,
                                            datasets: chart_data
                                          },
                                    options: chart_options
                                  });

}


// Function to render table with complete record data - Used in download job records & realtime analytics & daily / hourly operation analytics
function render_table_maintenance_records(maintenance_record_array, table_id, selected_operation_list = [])
{
  var operation_names = [];
  var maintenance_parameters_list = [];      // get list of parameters

  // If selected_operation_list is provided, use only those operations for table
  if(!is_null(selected_operation_list) )
  {
    operation_names = selected_operation_list;
  }
  else
  {
    // Else get all operation names across all records
    for(var i=0; i<maintenance_record_array.length; i++)
    {
      operation_names.push(get_operation_name_from_workstation_id(maintenance_record_array[i].workstation))
    }
  }

  operation_names = Array.from(new Set(operation_names));

  for(var i=0; i<maintenance_record_array.length; i++)
  {
    var op_name = get_operation_name_from_workstation_id(maintenance_record_array[i].workstation);

    if(operation_names.indexOf(op_name) >= 0)
    {
      maintenance_parameters_list = maintenance_parameters_list.concat(Object.keys(maintenance_record_array[i].param_list));
    }

  }
  //remove duplicate parameter names
  maintenance_parameters_list = Array.from(new Set(maintenance_parameters_list));
 
  // create table
  let table = document.getElementById(table_id);

  let table_header = document.createElement("thead");
  let header_row = document.createElement("tr");


  let th_type = document.createElement("th");
  th_type.innerText = "Maintenance Type"; 
  header_row.appendChild(th_type);

  let th_workstation = document.createElement("th");
  th_workstation.innerText = "Workstation ID"; 
  header_row.appendChild(th_workstation);

  let th_remark = document.createElement("th");
  th_remark.innerText = "Maintenance Description"; 
  header_row.appendChild(th_remark);

  let th_timestamp = document.createElement("th");
  th_timestamp.innerText = "Maintenance Time"; 
  header_row.appendChild(th_timestamp);

  let th_user = document.createElement("th");
  th_user.innerText = "Maintenance By"; 
  header_row.appendChild(th_user);


  // Maintenance parameters added to column group heading
  for(var i=0; i<maintenance_parameters_list.length; i++)
  {
    let th_parameter = document.createElement("th");
    th_parameter.innerText = maintenance_parameters_list[i]; 
    header_row.appendChild(th_parameter);
  }

  table_header.appendChild(header_row);
  // End of table header generation section

  let table_body = document.createElement("tbody");
  table_body.className = "text-break";

  // Add values for each row
  for(var i=0; i<maintenance_record_array.length; i++)
  {
    let body_row = document.createElement("tr");

    let td_type = document.createElement("td");
    td_type.innerText = maintenance_record_array[i].type; 
    body_row.appendChild(td_type);
  
    let td_workstation = document.createElement("td");
    td_workstation.innerText = maintenance_record_array[i].workstation; 
    body_row.appendChild(td_workstation);
     
    let td_remark = document.createElement("td");
    td_remark.innerText = maintenance_record_array[i].remark; 
    body_row.appendChild(td_remark);

    let td_timestamp = document.createElement("td");
    td_timestamp.innerText = decode_date(maintenance_record_array[i].timestamp) || "-"; 
    body_row.appendChild(td_timestamp);
 
    let td_user = document.createElement("td");
    td_user.innerText = maintenance_record_array[i].user || "-"; 
    body_row.appendChild(td_user);
   

    for(j=0; j<maintenance_parameters_list.length; j++)
    {
      let td_parameter = document.createElement("td");
      td_parameter.innerText = maintenance_record_array[i].param_list[maintenance_parameters_list[j]] || "n/a"; 
      body_row.appendChild(td_parameter);
    }


    table_body.appendChild(body_row);

  } 
  // End of table body generation section

table.appendChild(table_header);
table.appendChild(table_body);

  $("#"+ table_id).DataTable( {
                                              "lengthMenu": [[10, 25, 50, -1], [10, 25, 50, "All"]],
                                              "lengthChange": true,
                                              "columnDefs": [
                                                              { targets: '_all', visible: true,  "width": "150px" }
                                                            ],
                                              "colReorder": true,
                                              "fixedColumns":   {leftColumns: 2},
                                              "paging": true,
                                              "dom": '<"row"<"col-sm-12 p-2"Bf>><t><"row"<"col-sm-4 mb-2 mt-2 text-left"l><"col-sm-4 mb-2 text-center"i><"col-sm-4 text-right mb-2"p>>',
                                              "buttons": [
                                                          "searchBuilder",
                                                          {
                                                            extend: 'collection',
                                                            text: 'Export Data',
                                                            buttons: ['copy','excel','csv']
                                                          },                                                          
                                                         ]
                                             });
return true;
}


function get_operation_name_from_workstation_id(workstation_id)
{
    //position of ")"
    var start_index = workstation_id.length;

    while( workstation_id[start_index] != "(" )
    {
      start_index--;
    }

    var operation_name = workstation_id.substr(start_index+1);                       // Get substring after last "("
    operation_name = operation_name.substr(0, operation_name.length-1) ;        // Remove end ")"

    return(operation_name);
}


// Format chart data as required by chart dataset variable
function convert_maintenance_data_to_chart_dataset(input_data)
{
  var dataset = [];

  var keys = Object.keys(input_data);
  for(var i=0; i< keys.length; i++)
  {
    var dataset_item = 
                       {
                        label: keys[i],
                        data: input_data[keys[i]],
                        maxBarThickness: 50,
                        barThickness: 'flex',
                        stack: 1,
                        backgroundColor: (keys.length<=indexcolors.length) ? indexcolors[i] : "#4E73DF" ,
                       }
    dataset.push(dataset_item);
  }
return dataset;
}




////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                  Pending Jobs by Operation - sub section of Dashboard                              //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////     

async function initialize_operation_pending_jobs_section()
{
  reset_sections();
  empty_container("operation_pending_jobs_select");
  document.getElementById("operation_pending_jobs_table_container").style.display = "none";

  if( is_null(gl_current_operations_list) )
  gl_current_operations_list = await read_production_operations_list();

  var operation_name_list = Object.keys(gl_current_operations_list);
  operation_name_list = operation_name_list.sort();
  var permitted_operation_list = ["Select Operation"];

  // Set list of operations where user has read permissions
  for(var i=0; i<operation_name_list.length; i++)
  {
    if(gl_user_permission.admin == 1 || gl_user_permission[operation_name_list[i]] >= 1 )
    permitted_operation_list.push(operation_name_list[i]);
  }

  permitted_operation_list.push("Ready for Dispatch");
  
  set_select_options(document.getElementById("operation_pending_jobs_select"), permitted_operation_list);
 
  fetch_data_operation_pending_jobs_btn.onclick = async function(){
   
    gl_analytics_operation_name = document.getElementById("operation_pending_jobs_select").value;

    if(gl_analytics_operation_name == "Select Operation" || is_null(gl_analytics_operation_name) )
    {
      display_error("Please select Operation before fetching data");
      return false;
    }

    if(gl_user_permission.admin != 1 && (gl_user_permission[gl_analytics_operation_name] < 1 || gl_user_permission[section_permission_list["View Dashboard"]] != 1 ) )
    {
      display_error("You do not have sufficient permissions for this operation. Please contact your admin.");
      return false;
    }    

    try{
      start_loading();  
      const download_operation_pending_jobs_data = functions.httpsCallable('download_operation_pending_jobs_data');
      gl_analytics_records_list = (await download_operation_pending_jobs_data({"operation_name" : gl_analytics_operation_name})).data;
      
      var table_container = document.getElementById("operation_pending_jobs_table_container");
      empty_container_byReference(table_container);
      let table = document.createElement("table");
      table.className="table table-responsive table-striped table-bordered wrap display stripe row-border";
      table.style = "width:100%";
      table.id = "operation_pending_jobs_table";
      table_container.appendChild(table);


      await render_table_operation_pending_jobs(gl_analytics_records_list, table.id);
      document.getElementById("operation_pending_jobs_table_container").style.display = "block";
    
      stop_loading();
      }
      catch(error)
      {
        display_error(error.message);
        return false;
      }


  }

}


// Function to render table of operation pending jobs
function render_table_operation_pending_jobs(operation_pending_jobs_list, table_id)
{
  // create table
  let table = document.getElementById(table_id);
  
  let table_header = document.createElement("thead");
  let header_row = document.createElement("tr");

  let th_operation = document.createElement("th");
  th_operation.innerText = "Operation"; 
  header_row.appendChild(th_operation);  

  let th_model = document.createElement("th");
  th_model.innerText = "Model"; 
  header_row.appendChild(th_model);

  let th_serial = document.createElement("th");
  th_serial.innerText = "Serial ID"; 
  header_row.appendChild(th_serial);

  let th_op_status = document.createElement("th");
  th_op_status.innerText = "Job Status"; 
  header_row.appendChild(th_op_status);
  
  let th_op_pending_since_days = document.createElement("th");
  th_op_pending_since_days.innerText = "Pending since (days)"; 
  header_row.appendChild(th_op_pending_since_days);
  
  let th_op_pending_since_date = document.createElement("th");
  th_op_pending_since_date.innerText = "Pending since (date)"; 
  header_row.appendChild(th_op_pending_since_date);

  table_header.appendChild(header_row);
  // End of table header generation section

  let table_body = document.createElement("tbody");
  table_body.className = "text-break";

  // Add values for each row
  for(var i=0; i<operation_pending_jobs_list.length; i++)
  {
    let body_row = document.createElement("tr");

    let td_operation = document.createElement("td");
    td_operation.innerText = operation_pending_jobs_list[i].operation; 
    body_row.appendChild(td_operation);

    let td_model = document.createElement("td");
    td_model.innerText = operation_pending_jobs_list[i].model; 
    body_row.appendChild(td_model);
  
    let td_serial = document.createElement("td");
    td_serial.innerText = operation_pending_jobs_list[i].serial; 
    body_row.appendChild(td_serial);
  
    let td_op_status = document.createElement("td");
    td_op_status.innerText = status_list[operation_pending_jobs_list[i].status]; 
    body_row.appendChild(td_op_status);
    
    let td_op_pending_since_days = document.createElement("td");
    var days_pending = Math.abs(new Date() - decode_date(operation_pending_jobs_list[i].pending_since_dt,1) )/(1000*60*60*24);
    td_op_pending_since_days.innerText = days_pending.toFixed(0); 
    body_row.appendChild(td_op_pending_since_days);
    
    let td_op_pending_since_date = document.createElement("td");
    td_op_pending_since_date.innerText = decode_date(operation_pending_jobs_list[i].pending_since_dt);
    body_row.appendChild(td_op_pending_since_date);
    
    table_body.appendChild(body_row);

    }


  // End of table body generation section

table.appendChild(table_header);
table.appendChild(table_body);


  $("#"+ table_id).DataTable( {
                                              "lengthMenu": [[10, 25, 50, -1], [10, 25, 50, "All"]],
                                              "lengthChange": true,
                                              "colReorder": true,
                                              "paging": true,
                                              "dom": '<"row"<"col-sm-12 p-2"Bf>><t><"row"<"col-sm-4 mb-2 mt-2 text-left"l><"col-sm-4 mb-2 text-center"i><"col-sm-4 text-right mb-2"p>>',
                                              "buttons": [                                                  
                                                          "searchBuilder",
                                                          {
                                                            extend: 'collection',
                                                            text: 'Export Data',
                                                            buttons: ['copy','excel','csv']
                                                          },                                                          
                                                         ]
                                             });
return true;
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                  Deviation Required Jobs - sub section of Dashboard                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////     

async function initialize_deviation_required_jobs_section()
{
  await reset_sections();
  fetch_data_deviation_required_jobs_btn.onclick = async function(){

      // check user permissions
      if(gl_user_permission.admin == 1 || gl_user_permission[section_permission_list["View Dashboard"]] == 1 )
      {
        var records_array = [];
//        records_array = get_dummy_records();
        try{
        start_loading();  

        if (is_null(gl_current_operations_list) )
        gl_current_operations_list = await read_production_operations_list();

        var operations_list = Object.keys(gl_current_operations_list); 
        
        const download_deviation_required_jobs_data = functions.httpsCallable('download_deviation_required_jobs_data');
        records_array = (await download_deviation_required_jobs_data({"operations": operations_list})).data;


        var table_container = document.getElementById("deviation_required_jobs_table_container");

        empty_container_byReference(table_container);
        let table = document.createElement("table");
        table.className="table table-responsive table-striped table-bordered nowrap display stripe row-border";
        table.style = "width:100%";
        table.id = "deviation_required_jobs_table";
        table_container.appendChild(table);

        await render_table_deviation_required_jobs(records_array, "deviation_required_jobs_table");
        stop_loading();
        }
        catch(error)
        {
          display_error(error.message);
          return false;
        }

        return true;
      }
      else 
      {
        display_error("You do not have sufficient permissions for this operation. Please contact your admin.");
        return false;
      }


  }

}

// Function to render table of jobs requiring deviations
function render_table_deviation_required_jobs(deviation_operation_list, table_id)
{
  // create table
  let table = document.getElementById(table_id);
  
  let table_header = document.createElement("thead");
  let header_row = document.createElement("tr");

  let th_operation = document.createElement("th");
  th_operation.innerText = "Operation"; 
  header_row.appendChild(th_operation);  

  let th_model = document.createElement("th");
  th_model.innerText = "Model"; 
  header_row.appendChild(th_model);

  let th_serial = document.createElement("th");
  th_serial.innerText = "Serial ID"; 
  header_row.appendChild(th_serial);

  let th_op_status = document.createElement("th");
  th_op_status.innerText = "Status"; 
  header_row.appendChild(th_op_status);
  
  let th_op_workstation = document.createElement("th");
  th_op_workstation.innerText = "Workstation ID"; 
  header_row.appendChild(th_op_workstation);

  let th_op_pending_since_days = document.createElement("th");
  th_op_pending_since_days.innerText = "Pending since (days)"; 
  header_row.appendChild(th_op_pending_since_days);
  
  let th_op_log_entry_dt = document.createElement("th");
  th_op_log_entry_dt.innerText = "Entry Date"; 
  header_row.appendChild(th_op_log_entry_dt);
  
  let th_op_log_entry_by = document.createElement("th");
  th_op_log_entry_by.innerText = "Entry By"; 
  header_row.appendChild(th_op_log_entry_by);
  

  table_header.appendChild(header_row);
  // End of table header generation section

  let table_body = document.createElement("tbody");
  table_body.className = "text-break";

  // Add values for each row
  for(var i=0; i<deviation_operation_list.length; i++)
  {
    let body_row = document.createElement("tr");

    let td_operation = document.createElement("td");
    td_operation.innerText = deviation_operation_list[i].operation; 
    body_row.appendChild(td_operation);

    let td_model = document.createElement("td");
    td_model.innerText = deviation_operation_list[i].model; 
    body_row.appendChild(td_model);
  
    let td_serial = document.createElement("td");
    td_serial.innerText = deviation_operation_list[i].serial; 
    body_row.appendChild(td_serial);
  
    let td_op_status = document.createElement("td");
    td_op_status.innerText = status_list[deviation_operation_list[i].status]; 
    body_row.appendChild(td_op_status);
    
    let td_op_workstation = document.createElement("td");
    td_op_workstation.innerText = deviation_operation_list[i].workstation.toString(); 
    body_row.appendChild(td_op_workstation);
    
    let td_op_pending_since_days = document.createElement("td");
    var days_pending = Math.abs(new Date() - decode_date(deviation_operation_list[i].entry_dt,1) )/(1000*60*60*24);
    td_op_pending_since_days.innerText = days_pending.toFixed(0); 
    body_row.appendChild(td_op_pending_since_days);
    
    let td_op_log_entry_dt = document.createElement("td");
    td_op_log_entry_dt.innerText = decode_date(deviation_operation_list[i].entry_dt); 
    body_row.appendChild(td_op_log_entry_dt);
    
    let td_op_log_entry_by = document.createElement("td");
    td_op_log_entry_by.className = "text-break";
    td_op_log_entry_by.innerText = deviation_operation_list[i].entry_by; 
    body_row.appendChild(td_op_log_entry_by);
    
    table_body.appendChild(body_row);

    }


  // End of table body generation section

table.appendChild(table_header);
table.appendChild(table_body);


  $("#"+ table_id).DataTable( {
                                              "lengthMenu": [[10, 25, 50, -1], [10, 25, 50, "All"]],
                                              "lengthChange": true,
                                              "colReorder": true,
                                              "paging": true,
                                              "dom": '<"row"<"col-sm-12 p-2"Bf>><t><"row"<"col-sm-4 mb-2 mt-2 text-left"l><"col-sm-4 mb-2 text-center"i><"col-sm-4 text-right mb-2"p>>',
                                              "buttons": [                                                  
                                                          "searchBuilder",
                                                          {
                                                            extend: 'collection',
                                                            text: 'Export Data',
                                                            buttons: ['copy','excel','csv']
                                                          },                                                          
                                                         ]
                                             });
return true;
}




////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                  Display Job Records - sub section of Dashboard                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////     

//Function to initialize download job record section
async function initialize_download_job_records_section()
{
  document.getElementById("search_mode_download_job_records_section").value = "Search By";
  await reset_sections();

  // onclick function to fetch & display records
  fetch_data_download_job_records_btn.onclick = async function(){

    var starting_serial = document.getElementById("from_serial_download_job_records_section").value;
    var ending_serial = document.getElementById("to_serial_download_job_records_section").value;
    var mode = document.getElementById("search_mode_download_job_records_section").value;

    if(mode == "External ID") mode = 1;
    else mode = 0;


    // if serial number fields are invalid or improper format display error and return false
    if(! (validate_serial_number(starting_serial) && validate_serial_number(ending_serial)  )) return false;

    if ( starting_serial > ending_serial )
    {
      display_error("Starting serial number cannot be greater than ending serial number.");
      return false;
    }

    // check user permissions
    if(gl_user_permission.admin == 1 || gl_user_permission[section_permission_list["View Dashboard"]] == 1 )
      {
        var records_array = [];
        try{
        start_loading();  
        const download_job_records = functions.httpsCallable('download_job_records');
        records_array = (await download_job_records({"starting_serial" : starting_serial.toString(), "ending_serial" : ending_serial.toString(), "mode" : mode})).data;

        var table_container = document.getElementById("download_job_records_table_container");

        empty_container_byReference(table_container);
        let table = document.createElement("table");
        table.className="table table-responsive table-striped table-bordered wrap display stripe row-border";
        table.style = "width:100%";
        table.id = "download_job_records_table";
        table_container.appendChild(table);

        await render_table_job_records(records_array, "download_job_records_table");

        stop_loading();
        }
        catch(error)
        {
          display_error(error.message);
          return false;
        }

        return true;
      }
      else 
      {
        display_error("You do not have sufficient permissions for this operation. Please contact your admin.");
        return false;
      }
  }

}






////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                             Create Serial Number                                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////     

//Function to initialize create serial number section

async function initialize_create_serial_section()
{
await reset_sections();
// error if user is not authorised to create serial number
if(gl_user_permission.admin != 1 && gl_user_permission[section_permission_list["Add New Job"]] != 1) 
{
display_error("You do not have sufficient permissions for this operation.");
return false;
}

await set_model_list_display();
var total_serial_number_select_container = document.getElementById("total_serial_number_select_list");
await empty_container_byReference(total_serial_number_select_container);
await set_select_options( total_serial_number_select_container, await generate_min_max_array(1,100));
document.getElementById("total_serial_number_select_list").value = 1;
}

// support function to break text to multi line in canvas print
function canvas_print_break( context , text, x, y, lineHeight, fitWidth, align = "center")
{
  context.fillStyle = "black";
  context.font = lineHeight + "px Verdana";
  context.textAlign = align; 

  var str_list = [];
  var current_line_number = -1;

  for(var i=0; i<text.length; i++)
  {
    if(i%fitWidth == 0)
    {
      current_line_number += 1;
      str_list[current_line_number] = "";
    }

    str_list[current_line_number] += text[i];

  }

  for(var i=0; i<= current_line_number; i++)
  {
    context.fillText(str_list[i], x, y + lineHeight * i * 1.2)
  }

  return true;
}


//Function to validate & write serial number to database and then display
async function create_and_display_QR(serial_number, model_id)
{
  try
  {
    await start_loading();  
    let status = await write_serial_number(serial_number, model_id);
    if (status == true) 
    {
    display_QR(serial_number, model_id);
    //         current_credits_remaining = current_credits_remaining - 1;
    }
  }
  catch(error)
  {
    await display_error("Serial Number record could not be created. Please check if you have sufficient credits remaining.")
  }
}

//Create QR Label PDF for download
async function create_qr_label_pdf(serial_number, model_id = "", date="")

{
const pdf_width = 100;          // label dimensions in mm
const pdf_height = 50;
const starting_height = 4;
var vertical_pos = starting_height;
const spacing = 4;

const img_edge = 35; // measurement of qr img length / side
const maxLineWidth = pdf_width - img_edge - spacing*2.5;

var text = "";

const doc = new jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: [pdf_width, pdf_height] });


var QR_img = new Image();
QR_img.setAttribute('crossOrigin', 'anonymous');
QR_img.src = "https://chart.googleapis.com/chart?cht=qr&chs=140x140&choe=UTF-8&chld=L|0&chl=" + encodeURIComponent(serial_number);

doc.addImage(QR_img, "PNG", spacing, starting_height, img_edge, img_edge);

// set company name
const company_name = gl_curr_user_details.company;
text += company_name + "\n\n";

//doc.setTextColor("black");  
//doc.setFontSize(12);
//doc.text(company_name, img_edge + 1.5*spacing, vertical_pos+=spacing*1.5, {align:"left"});    

// set model_ id
doc.setTextColor("black");  
doc.setFontSize(12);
text += "Model: " + model_id + "\n\n";

if(date!="") text += "Date: " + await decode_date(date);

var textLines = doc.setFontSize(11).splitTextToSize(text, maxLineWidth);
doc.text(textLines, img_edge + spacing*1.5 , starting_height + spacing*1.4);

//doc.text("Model ID:\n" + model_id, img_edge + 1.5*spacing, vertical_pos+=spacing*2, {align:"left"});    

// set serial number
doc.setTextColor("black");  
doc.setFontSize(12);
doc.text( serial_number, pdf_width/2, pdf_height-spacing, {align:"center"});    




doc.save(serial_number +"_label.pdf");
}


//Function to draw & display serial number QR canvas section
async function display_QR(serial_number, model_id = "", date="")
{
  await start_loading();  
  var white_rgb="255-255-255";  
  var QR_img = new Image();
  QR_img.setAttribute('crossOrigin', 'anonymous');
  QR_img.src = "https://chart.googleapis.com/chart?cht=qr&chs=140x140&choe=UTF-8&chld=L|0&chl=" + encodeURI(serial_number);
//  QR_img.src = "https://api.qrserver.com/v1/create-qr-code/?size=250x250&bgcolor="+white_rgb+"&data=" + encodeURI(serial_number);

  const img_x_start = 5;
  const img_y_start = 10;
  const text_fit_width = 30;
  const text_y_gap = 15;
  var text_y_start = img_y_start*3 + text_y_gap/2;

  QR_img.onload = async function()
  {
    try
    {
      var qrCanvas = document.getElementById("qr_canvas");
      qrCanvas.width = "400";
      qrCanvas.height = "200";

      var qr_ctx = qrCanvas.getContext("2d");
      qr_ctx.clearRect(0,0,qrCanvas.width,qrCanvas.height);
  
      qr_ctx.fillStyle = "white";
      qr_ctx.fillRect(0,0,qrCanvas.width,qrCanvas.height);
  
      qr_ctx.drawImage(QR_img,img_x_start,img_y_start);
  

      canvas_print_break( qr_ctx , gl_curr_user_details.company, img_x_start + QR_img.width, text_y_start , text_y_gap, text_fit_width, "left");
      text_y_start += (Math.floor(gl_curr_user_details.company.length / text_fit_width) + 2) * text_y_gap;

      var model_id_text = "Model ID: " + model_id; 
      canvas_print_break( qr_ctx , model_id_text, img_x_start + QR_img.width, text_y_start, text_y_gap, text_fit_width, "left");
      text_y_start += (Math.floor(model_id_text.length / text_fit_width) + 2) * text_y_gap;

      if(date!= "")
      {
        const date_text = "Date: " + date;
        canvas_print_break( qr_ctx , date_text, img_x_start + QR_img.width, text_y_start, text_y_gap, text_fit_width, "left");
        text_y_start += (Math.floor(date_text.length / text_fit_width) + 2) * text_y_gap;  
      }

      const serial_number_text = serial_number;
      canvas_print_break( qr_ctx , serial_number_text, qrCanvas.width/2, img_y_start + QR_img.height + text_y_gap*1.2, text_y_gap + 2 , text_fit_width, "center");

// No resize required as using PDF format for label download      
//      qrCanvas = await resize_canvas(qrCanvas,gl_image_scale_factor);

      document.getElementById("download_qr_btn").href = "#";
      document.getElementById("download_qr_btn").onclick = async function() {await create_qr_label_pdf(serial_number, model_id, date);}
//      document.getElementById("download_qr_btn").download = serial_number + ".png";
  
      document.getElementById("navigation_create_serial_1").style.display = "none";
      document.getElementById("navigation_create_serial_2").style.display = "flex";  
  
      await stop_loading();
      return true;
    }
    catch(error)
    {
      console.log(error);
      await display_error("Failed to display QR label. Please try again.");
      return false;
    }

  }


}


// Function to populate model select list
async function set_model_list_display()
{
let container = document.getElementById("model_select_list"); 
empty_container("model_select_list");

if( is_null(gl_model_list) )
gl_model_list = await read_model_list();

gl_model_list.sort();
var tot_models = gl_model_list.length;

for(i=0; i<tot_models;i++)
{
var option = document.createElement("option");                  
  option.innerText = gl_model_list[i];
  container.appendChild(option);

}

} 

//Function to reset view to create another serial number
function reset_create_serial(field_id)
{
document.getElementById(field_id).value = "";
document.getElementById("total_serial_number_select_list").value = 1;

var qrCanvas = document.getElementById("qr_canvas");
var qr_ctx = qrCanvas.getContext("2d");
qr_ctx.clearRect(0,0,qrCanvas.width,qrCanvas.height);

document.getElementById("navigation_create_serial_2").style.display = "none";
document.getElementById("navigation_create_serial_1").style.display = "flex";

}

// Function to delete serial number
async function remove_new_serial(serial_number)
{
  if(validate_serial_number(serial_number))
  {
    await display_confirmation("Are you sure you want to delete Serial Number <b>" + serial_number + "</b>?", delete_serial_number, serial_number);
    document.getElementById("serial_number_delete_section").value = "";
    return true;
  }
}

// Function to create new serial number
async function create_new_serial(serial_number,ending_serial= 0, remaining_serial_numbers = 0)
{
let model_id = document.getElementById("model_select_list").value; 


if (validate_serial_number(serial_number) && validate_input(model_id))
{
var record = await read_serial_number_record(serial_number);

if (record !== false) 
  { 
    display_confirmation("Serial Number - <b>" + serial_number + "</b> already exists. Do you want to view the QR label again?", display_QR, serial_number, record["Basic Info"].model);
  }
else 
  {
    if(remaining_serial_numbers != 0)
    display_confirmation("Starting creation of " + (remaining_serial_numbers+1) + " serial numbers from "+ serial_number +
                         " to "+ ending_serial + ".<hr>Are you sure you want to create serial number <b>" + serial_number + 
                         "</b> of type <b>" + model_id + "</b> ?", create_and_display_QR, serial_number, model_id);
    else
    display_confirmation("Are you sure you want to create serial number <b>"+serial_number+"</b> of type <b>" + model_id + "</b> ?", create_and_display_QR, serial_number, model_id);
  }
}

}

// Support function to generate multi serial numbers create list
function setup_multi_serial_number_create_list()
{
  var serial = document.getElementById("serial_number_create_section").value.toString();
//  var model = document.getElementById("model_select_list").value;
  var tot_serial_numbers = document.getElementById("total_serial_number_select_list").value;
  gl_pending_multi_serial_number_create_list = [];

  var index = -1; 
  for(var i=serial.length-1; i>=0; i--)
  {
    if(isNaN(serial[i]) == true && index == -1)
    index = i+1;
  }
  if(index==-1) index = 0;

  var prefix_string = serial.substr(0, index);
  var ini_num_string = serial.substr(index, serial.length - index);       // starting serial number - String type
  var ini_num = Number(ini_num_string);                                   // starting serial number - Number type

  for(var i=tot_serial_numbers-1; i>=0; i--)
  {
    var curr_number = String(ini_num+i);
    gl_pending_multi_serial_number_create_list.push(String(prefix_string + curr_number.padStart(serial.length - index,'0') ) ); 
//    console.log(prefix_string + curr_number.padStart(serial.length - index,'0') );
  }

  return ([gl_pending_multi_serial_number_create_list.pop(), gl_pending_multi_serial_number_create_list[0] || 0,  gl_pending_multi_serial_number_create_list.length]);
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                View / Update Serial Number Record Section                                          //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////    

//Support Function to format record for create_process_record_pdf
async function convert_record_to_array_log(record)
{
  var record_array_log = [];
  var processing_history_array_log = [];                // contains history of saves / updates by users
  var operation_list = record["Basic Info"]["op_order"];

  for(var i=0; i<operation_list.length; i++)
  {

  // Don't print full operation list. Check if useris admin or has minimum Read access permission (1) before printing. Also check operation status
  if((gl_user_permission.admin == 1 || gl_user_permission[operation_list[i]] > 0) && record[operation_list[i]].status != 2 )
    {

      var param_list = record[operation_list[i]].param_list;

      for(var j=0; j<param_list.length; j++)
      {
        const param_name = param_list[j].name;
        const param_value = record[operation_list[i]].actual_value[param_name][0];

        const lot_size = param_list[j].freq || 1;
        const measurement_type = (record[operation_list[i]].actual_value[param_name][1] == 0)?"Actual" : "Sample [Lot size: " + lot_size + " pcs]"; 
        const measurement_method = param_list[j].method || "";
        var criteria = "";


        if(param_list[j].type === data_types[0])          //Numeric Range Type
        criteria = "Min Value: " + (param_list[j].value1 || "-").toString() + " , Max Value: " + (param_list[j].value2 || "-").toString();
        
        
        else if (param_list[j].type === data_types[1])    //Option List - Display acceptable options
        criteria = param_list[j].value1;
        
        else if (param_list[j].type === data_types[2])    //Sub-assembly part - serial number
        criteria = param_list[j].value1 + " Type Sub-Component";
        
        else if (param_list[j].type === data_types[3])    //Free Response
        criteria = "";

        //validate param value
        var validation = await validate_input_field_value(param_list[j].type, param_list[j].value1, param_list[j].value2, record[operation_list[i]].actual_value[param_list[j].name][0]); 
        var status_check;
        if (validation == true) status_check = "OK";   // All ok
        else if (validation == false && record[operation_list[i]].status == 0) status_check = "DEVIATION";    // Deviation allowed
        else status_check = "NOT OK";   // Not ok - error        

        record_array_log.push([ operation_list[i], param_name, criteria, measurement_method, param_value, measurement_type, status_check ]);
      }
  
      if(!is_null(record[operation_list[i]].log.entry_by))
      {
//        var entry_by =  record[operation_list[i]].log.entry_by + " [ " + decode_date(record[operation_list[i]].log.entry_dt) + " ]";
//        record_array_log.push([ operation_list[i] , "Entry By" , entry_by, "" , "" ]);  

        processing_history_array_log.push( [operation_list[i], "Data Entered", record[operation_list[i]].log.entry_by, decode_date(record[operation_list[i]].log.entry_dt)] );
      }
      if(!is_null(record[operation_list[i]].log.update_by))
      {
 //       var update_by =  record[operation_list[i]].log.update_by + " [ " + decode_date(record[operation_list[i]].log.update_dt) + " ]";
  //      record_array_log.push([ operation_list[i] , "Update By" , update_by, "" , "" ]);  

        processing_history_array_log.push( [operation_list[i], "Data Updated", record[operation_list[i]].log.update_by, decode_date(record[operation_list[i]].log.update_dt)] );

      }    
      if(!is_null(record[operation_list[i]].log.deviation_by))
      {
//        var deviation_by =  record[operation_list[i]].log.deviation_by + " [ " + decode_date(record[operation_list[i]].log.deviation_dt) + " ]";
        var param_title = (record[operation_list[i]].status == 4) ? "Rejected" : "Deviation Allowed";
//        record_array_log.push([ operation_list[i] , param_title , deviation_by, "", "" ]);  

        processing_history_array_log.push( [operation_list[i], param_title, record[operation_list[i]].log.deviation_by, decode_date(record[operation_list[i]].log.deviation_dt)] );

      }    
      if(!is_null(record[operation_list[i]].log.remark))
      {
        var remark =  record[operation_list[i]].log.remark;
//        record_array_log.push([ operation_list[i] , "Remark" , remark, "", "" ]);  

        processing_history_array_log.push( [operation_list[i], "Remark", record[operation_list[i]].log.remark, "" ] );

      }   

    }

  }
  return [record_array_log,processing_history_array_log];
}

//Support function to get data for dispatch details table in process record pdf
function get_dispatch_details_array_log(record)
{
  var array_log = [];

  array_log.push(["Dispatch ID", record["Basic Info"].external_id]);
  array_log.push(["Dispatch Remarks", record["Basic Info"]["log"].remark]);

  array_log.push(["Dispatch Date", decode_date(record["Basic Info"]["log"].entry_dt) ] );
  array_log.push(["Entry By", record["Basic Info"]["log"].entry_by ] );

  if(!is_null(record["Basic Info"]["log"].update_by))
  {
    array_log.push(["Update Date", decode_date(record["Basic Info"]["log"].update_dt) ] );
    array_log.push(["Update By", record["Basic Info"]["log"].update_by ] );   
  }

  return array_log;
}


/*
//Function to downlaod dispatch QR label section
async function download_dispatch_qr_label(serial_number, model_id = "", date="")
{
  await start_loading();  
  var white_rgb="255-255-255";  
  var QR_img = new Image();
  QR_img.setAttribute('crossOrigin', 'anonymous');
  QR_img.src = "https://chart.googleapis.com/chart?cht=qr&chs=140x140&choe=UTF-8&chld=L|0&chl=" + encodeURI(serial_number);
//  QR_img.src = "https://api.qrserver.com/v1/create-qr-code/?size=250x250&bgcolor="+white_rgb+"&data=" + encodeURI(serial_number);

  const img_x_start = 5;
  const img_y_start = 10;
  const text_fit_width = 30;
  const text_y_gap = 15;
  var text_y_start = img_y_start*3 + text_y_gap/2;

  QR_img.onload = async function()
  {
    try
    {
      var qrCanvas = document.createElement("canvas");
      qrCanvas.width = "400";
      qrCanvas.height = "200";

      const dowload_btn = document.createElement("a");

      var qr_ctx = qrCanvas.getContext("2d");
      qr_ctx.clearRect(0,0,qrCanvas.width,qrCanvas.height);
  
      qr_ctx.fillStyle = "white";
      qr_ctx.fillRect(0,0,qrCanvas.width,qrCanvas.height);
  
      qr_ctx.drawImage(QR_img,img_x_start,img_y_start);
  

      canvas_print_break( qr_ctx , gl_curr_user_details.company, img_x_start + QR_img.width, text_y_start , text_y_gap, text_fit_width, "left");
      text_y_start += (Math.floor(gl_curr_user_details.company.length / text_fit_width) + 2) * text_y_gap;

      var model_id_text = "Model ID: " + model_id; 
      canvas_print_break( qr_ctx , model_id_text, img_x_start + QR_img.width, text_y_start, text_y_gap, text_fit_width, "left");
      text_y_start += (Math.floor(model_id_text.length / text_fit_width) + 2) * text_y_gap;

      if(date!= "")
      {
        const date_text = "Date: " + await decode_date(date);
        canvas_print_break( qr_ctx , date_text, img_x_start + QR_img.width, text_y_start, text_y_gap, text_fit_width, "left");
        text_y_start += (Math.floor(date_text.length / text_fit_width) + 2) * text_y_gap;  
      }

      const serial_number_text = serial_number;
      canvas_print_break( qr_ctx , serial_number_text, qrCanvas.width/2, img_y_start + QR_img.height + text_y_gap*1.2, text_y_gap + 2 , text_fit_width, "center");

      qrCanvas = await resize_canvas(qrCanvas,gl_image_scale_factor);

      dowload_btn.href = qrCanvas.toDataURL("image/png");
      dowload_btn.download = serial_number + ".png";
  
      await stop_loading();
      await dowload_btn.click();
      return true;
    }
    catch(error)
    {
      console.log(error);
      await display_error("Failed to load QR label. Please try again.");
      return false;
    }

  }


}
*/

//Create Process Record PDF for download
async function create_process_record_pdf(record)

{
const pdf_width = 297;          // a4 paper - dimensions in mm
const pdf_height = 210;
const starting_height = 10;
var vertical_pos = starting_height;
const spacing = 6;

const doc = new jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: [pdf_width, pdf_height] });

// set company name on page top center
const company_name = gl_curr_user_details.company;
doc.setTextColor("black");  
doc.setFontSize(17);
doc.text(company_name, pdf_width/2, vertical_pos+=spacing, {align:"center"});    

// Print process record title with serial number
doc.setTextColor("black");  
doc.setFontSize(12);
var id_string = "Process Record for Serial Number : " + record["Basic Info"].serial;
if( (record["Basic Info"].external_id != "") ) id_string += " [" + record["Basic Info"].external_id + "]";
doc.setTextColor("black");  
doc.text(id_string, pdf_width*0.5, vertical_pos+=spacing, {align:"center"}); 

doc.setFontSize(10);        // regular font size

// Print model
doc.text("Model: " + record["Basic Info"].model, pdf_width*0.5, vertical_pos+=spacing, {align:"center"});  

var status_text = status_list[record["Basic Info"].status];

// SHow Status for dispatch if completed
if(record["Basic Info"].status == 0) status_text = "Ready for Dispatch";
if(record["Basic Info"].status == 0 && !is_null(record["Basic Info"].external_id)) status_text = "Dispatched";

// Print overall process status 
doc.text("Status : " + status_text, pdf_width*0.5, vertical_pos+=spacing, {align:"center"});    

// Get data into table format & create table
const processed_data = await convert_record_to_array_log(record);
var record_data = processed_data[0];
var processing_history_data = processed_data[1];

doc.autoTable({
                head: [['Operation', 'Parameter', 'Acceptance Criteria', 'Measurement Method', 'Value', 'Measurement Type', 'Status']],
                body: record_data,
                theme : 'grid',
                styles: { fontSize: 11, valign: 'middle', lineColor : '#000000' },
                headStyles : {fillColor: '#FFFFFF', textColor: '#000000', lineColor : '#000000', lineWidth: 0.1},          // Color of header
                columnStyles: { 4: { halign: 'center' } }, // Cells in third column centered and green
                startY: 40,
                didParseCell: function (data) {
                  if(data.section == "body" && data.column.index == 6 && data.cell.raw == "OK"){
                      data.cell.styles.fillColor = "#C6EFCE";
                      data.cell.styles.textColor = "#006100";  
                  }
                  else if(data.section == "body" && data.column.index == 6 && data.cell.raw == "NOT OK"){
                      data.cell.styles.fillColor = "#FFC7CE";
                      data.cell.styles.textColor = "#9C0006";    
                  }  
                  else if(data.section == "body" && data.column.index == 6 && data.cell.raw == "DEVIATION"){
                      data.cell.styles.fillColor = "#FFEB9C";
                      data.cell.styles.textColor = "#9C5700";    
                  }      
                }

               });

doc.setFontSize(12);    
vertical_pos = doc.lastAutoTable.finalY+10;
doc.text("Job Processing History", pdf_width*0.5, vertical_pos+=spacing/2, {align:"center"});    
vertical_pos+=spacing/2

doc.autoTable({
                head: [['Operation', 'Event', 'User', 'Time']],
                body: processing_history_data,
                theme : 'grid',
                styles: { fontSize: 11, valign: 'middle', lineColor : '#000000' },
                headStyles : {fillColor: '#FFFFFF', textColor: '#000000', lineColor : '#000000', lineWidth: 0.1},          // Color of header
                columnStyles: { 4: { halign: 'center' } }, 
                startY: vertical_pos,
               });               


if(!is_null(record["Basic Info"]["log"].entry_by))
{
  const dispatch_data = get_dispatch_details_array_log(record);
  
  doc.addPage();
  vertical_pos = starting_height;
  doc.text("Dispatch Details", pdf_width/2, vertical_pos+=spacing, {align:"center"});

console.log()
  doc.autoTable({
//                  head: [['Dispatch Details', '']],
                  body: dispatch_data,
                  theme : 'grid',
                  styles: { fontSize: 11, valign: 'middle', lineColor : '#000000' },
                  headStyles : {fillColor: '#FFFFFF', textColor: '#000000', lineColor : '#000000', lineWidth: 0.1},          // Color of header
  //                columnStyles: { 4: { halign: 'center' } }, 
                  startY: vertical_pos+= spacing,
                 });  
  
}


// Set Page Numbers & other details
for (var i=1; i<=doc.internal.getNumberOfPages(); i++ )
{
    doc.setTextColor(100);  // gray color
    doc.setFontSize(10);
    doc.setPage(i);
    doc.text("Job ID: "+ record["Basic Info"].serial, 10, 7, {align:'left'});
    doc.text("Page " + i + " of " + doc.internal.getNumberOfPages(), pdf_width-10, 7, {align:'right'});
    doc.text("Powered by Qik Process", pdf_width-10 , pdf_height-5, {align:'right'});

  }

doc.save(record["Basic Info"].serial +"_process_record.pdf");
}


//Function to display Deviation Modal for confirmation with message
function deviation_confirmation(operation_name, onsuccess_fn, record)
{
document.getElementById("deviation_remark").value = "";       // reset remark
document.getElementById("deviation_modal_message").innerText = "Do you want to allow deviation for the current operation (" + operation_name + ") ?";

yes_deviation_modal_btn.onclick = function()
{
var remark = document.getElementById("deviation_remark").value;
onsuccess_fn(operation_name, record, remark);
};

$("#deviationModal").modal();         
}


//Function to display Rejection Modal for confirmation with message
function rejection_confirmation(operation_name, onsuccess_fn, record)
{
document.getElementById("rejection_remark").value = "";       // reset remark
document.getElementById("rejection_modal_message").innerText = "Do you want to Reject the current part?";

yes_rejection_modal_btn.onclick = function()
{
var remark = document.getElementById("rejection_remark").value;
onsuccess_fn(operation_name, record, remark);
};

$("#rejectionModal").modal();         
}


// Function to validate input parameter
async function validate_input_field_value(param_type, param_value1, param_value2, actual_value)
{ 
try
{
  
if( is_null(gl_model_list) )
gl_model_list = await read_model_list();

if( is_null(actual_value) ) return false;

if(param_type == data_types[0])           // Numeric Range
{
  if(isNaN(actual_value))  return false;      // check if not number
 
  if( !is_null(param_value1) && !isNaN(param_value1))          //value is greater than min
      if( Number(actual_value) < Number(param_value1) ) return false;

  if( !is_null(param_value2) && !isNaN(param_value2))          //value is greater than max
      if( Number(actual_value) > Number(param_value2) ) return false ;     
      
   if(actual_value.toString().length > param_value_max_length) return false;
      
}

else if(param_type == data_types[1])           // Option List
{
  var accepted_options = param_value1.split(",");
  
  if(accepted_options.length < 1) return false;

  if (!accepted_options.includes(actual_value))
  {
    console.log(accepted_options);
    console.log(actual_value);
    return false;

  }

}

else if(param_type == data_types[2])           // Sub Component Serial
{
  // check model is valid and serial number is not same as current component

  if(!gl_model_list.includes(param_value1) || actual_value == gl_curr_record["Basic Info"].serial) return false;

  if(actual_value.toString().length > param_value_max_length) return false;

  var sub_component_record = await read_serial_number_record(actual_value);    // fetch record of sub component serial

  var model_id = sub_component_record["Basic Info"].model;
  
  // if model_id is empty or does not match model in param_value_1 -> error
  // Also if status is not 0 (completed)
  if( is_null(model_id) || model_id != param_value1 || sub_component_record["Basic Info"].status != 0)                     
  return false;
}


else if(param_type == data_types[3])           //  Free response value
{
  if(is_null(actual_value.toString() || actual_value.toString().length > param_value_max_length )) return false; 
}


return true;
}
catch(error)
{
return false;
}
}



// Function to render input field based on parameter type (for edit mode)
async function render_actual_value_input_field(param_type, param_value1, param_value2, param_value, stage_status = 2, current_operation)
{
var input_field;
if(param_value == undefined) param_value ="";

if(param_type == data_types[0])           //numeric range
{
input_field = document.createElement('input'); input_field.type = "number";
input_field.className = "form-control input mt-n1 mb-2 text-center text-dark bg-white";
input_field.maxLength = param_value_max_length;
input_field.value =  param_value;
}

else if(param_type == data_types[1])           //option list
{
var options_array = param_value1.split(",").concat(param_value2.split(","));

input_field = document.createElement("select");
input_field.className = "custom-select text-center mb-2";
set_select_options(input_field, [""].concat(options_array));
input_field.value =  param_value;
}

else if(param_type == data_types[2])           //sub assembly part
{
input_field = document.createElement('input');
input_field.className = "form-control input mt-n1 mb-2 text-center text-dark bg-white";
input_field.maxLength = param_value_max_length;
input_field.value =  param_value;
}

else if(param_type == data_types[3])           //type in value
{
input_field = document.createElement('input');
input_field.className = "form-control input mt-n1 mb-2 text-center text-dark bg-white";
input_field.maxLength = param_value_max_length;
input_field.value =  param_value;
}

input_field.onchange = async function()
{
var result = await validate_input_field_value(param_type, param_value1, param_value2, input_field.value);
if(!result)       
// if !false - field value is not valid  
{
if(!input_field.className.includes(" border-danger"))
input_field.className = input_field.className + " border-danger";
}
else
input_field.className = input_field.className.replace(" border-danger",""); 
}

// highlight incorrect parameters on render
if( (stage_status == 1 || stage_status == 3 || (stage_status == 2 && param_value != "") ) 
     &&  ! await validate_input_field_value(param_type, param_value1, param_value2, input_field.value))       
{
if(!input_field.className.includes(" border-danger"))
input_field.className = input_field.className + " border-danger";
}

return input_field;
}


// Function get current process status  - returns object with current_operation, current_status_value, minor & major deviation list
function current_process_status(record)
{
const operation_list = Object.keys(record);
var current_operation = ".";                                        // "." - indicates last operation
var current_status_value = 0;                                       // 0 -complete, 1 -minor deviation, 2- in progress, 3 -major deviation, 4 - rejected
                                                                //get max value to show current status
var operation_index = 0;                                            // 0 indicates all steps completed
var minor_deviation_list = [];
var major_deviation_list = [];

for(var i=1; i<operation_list.length; i++)                          // Get stages with Minor or Major deviation required status
{

if (record[operation_list[i]].status > current_status_value)
{
current_status_value = record[operation_list[i]].status;
current_operation = operation_list[i];
operation_index = i;
}

if (record[operation_list[i]].status == 1)                        // 1 - Minor Deviation Required
minor_deviation_list.push(operation_list[i]);

else if (record[operation_list[i]].status == 3)                   // 3 - Major Deviation Required
major_deviation_list.push(operation_list[i]);

}
minor_deviation_list = minor_deviation_list.join(" , ");
major_deviation_list = major_deviation_list.join(" , ");

var obj = 
      {
        operation_list : operation_list,              // list of operations / stages in record
        current_operation : current_operation,        // current operation pending / to be done
        operation_index : operation_index,            // index of current operation
        current_status_value : current_status_value,  // status of overall process - ["Basic Info"].status
        minor_deviation_list : minor_deviation_list,  // List of operations with minor deviation
        major_deviation_list : major_deviation_list   // List of operations with major deviation
      }

return obj;
}


// Called by display_qc_stage_info_card
// Function to create basic_info display card for set_serial_record_display
function create_basic_info_card(select_container, container,record , edit_mode = false)
{
empty_container_byReference(container);

var process_status = current_process_status(record);
var operation_list = process_status.operation_list;
var current_operation = process_status.current_operation;
var operation_index = process_status.operation_index;
var current_status_value = process_status.current_status_value;     
var minor_deviation_list = process_status.minor_deviation_list;
var major_deviation_list = process_status.major_deviation_list;

                                                                // div for non editable values section
let basic_info_card = document.createElement('div');                //Display status of serial number
basic_info_card.className = "col-sm-6 mx-auto text-center mt-2";

let basic_info_status_title = document.createElement('p');
basic_info_status_title.className = "text-dark";
basic_info_status_title.innerText = "Overall Status";

let basic_info_status = document.createElement('h4');
basic_info_status.className = "text-center " + status_list_color[record["Basic Info"].status];
basic_info_status.innerText = status_list[record["Basic Info"].status];
basic_info_status.readOnly = true; 

// If Completed Status (0) - show as ready for dispatch
// If Completed status & dispatch_id / external_id is present - show as dispatched
if(record["Basic Info"].status == 0) basic_info_status.innerText = "Ready for Dispatch";
if(record["Basic Info"].status == 0 && !is_null(record["Basic Info"]["log"].entry_by)) basic_info_status.innerText = "Dispatched";


let line = document.createElement('hr');
line.className = "col-sm-12 text-center";
line.style = "width:60%";

basic_info_card.appendChild(basic_info_status_title);
basic_info_card.appendChild(basic_info_status);
basic_info_card.appendChild(line);

if( !is_null(current_operation) && current_operation!= "." )                   //Display current operation of serial number
{
let basic_info_current_operation_title = document.createElement('p');
basic_info_current_operation_title.className = "text-dark";
basic_info_current_operation_title.innerText = "Current Operation";

let basic_info_current_operation = document.createElement('a');
basic_info_current_operation.className = "btn btn-light text-center text-break";
basic_info_current_operation.innerText =  current_operation;

basic_info_current_operation.onclick = function()
{  
select_container.value = current_operation;
display_qc_stage_info_card(select_container, container, record, edit_mode);
}

line = document.createElement('hr');
line.className = "col-sm-12 text-center";
line.style = "width:60%";

basic_info_card.appendChild(basic_info_current_operation_title);
basic_info_card.appendChild(basic_info_current_operation);
basic_info_card.appendChild(line);
}


if( !is_null(minor_deviation_list) )         //Display minor deviation list of serial number
{
let basic_info_minor_deviation_title = document.createElement('p');
basic_info_minor_deviation_title.className = "text-dark";
basic_info_minor_deviation_title.innerText = "Operations with Minor Deviation";

let basic_info_minor_deviation = document.createElement('h5');
basic_info_minor_deviation.className = "text-center text-danger text-break";
basic_info_minor_deviation.innerText =  minor_deviation_list;
basic_info_minor_deviation.readOnly = true; 

line = document.createElement('hr');
line.className = "col-sm-12 text-center";
line.style = "width:60%";

basic_info_card.appendChild(basic_info_minor_deviation_title);
basic_info_card.appendChild(basic_info_minor_deviation);
basic_info_card.appendChild(line);
}


if( !is_null(major_deviation_list) )         //Display major deviation list of serial number
{
let basic_info_major_deviation_title = document.createElement('p');
basic_info_major_deviation_title.className = "text-dark";
basic_info_major_deviation_title.innerText = "Operations with Major Deviation";

let basic_info_major_deviation = document.createElement('h5');
basic_info_major_deviation.className = "text-center text-danger text-break";
basic_info_major_deviation.innerText =  major_deviation_list;
basic_info_major_deviation.readOnly = true; 

line = document.createElement('hr');
line.className = "col-sm-12 text-center";
line.style = "width:60%";

basic_info_card.appendChild(basic_info_major_deviation_title);
basic_info_card.appendChild(basic_info_major_deviation);
basic_info_card.appendChild(line);
}


let editable_param_card = document.createElement('div');                // div for values edited / updated by user
editable_param_card.className = "col-sm-6 mx-auto text-center mt-2";


//Display Dispatch ID (external id) of serial number - editable param
// Also display Dispatch Remark

let basic_info_external_id_title = document.createElement('p');
basic_info_external_id_title.className = "text-dark";
basic_info_external_id_title.innerText = "Dispatch ID";

let basic_info_dispatch_remark_title = document.createElement('p');
basic_info_dispatch_remark_title.className = "text-dark";
basic_info_dispatch_remark_title.innerText = "Dispatch Details";

var basic_info_external_id;
var basic_info_dispatch_remark;

if (edit_mode)
{
basic_info_external_id = document.createElement('input');
basic_info_external_id.className = "form-control input mt-n2 text-center text-primary bg-white";
basic_info_external_id.value =  is_null(record["Basic Info"].external_id)  ? "" : record["Basic Info"].external_id;
basic_info_external_id.maxLength = param_value_max_length;

basic_info_dispatch_remark = document.createElement('textarea');
basic_info_dispatch_remark.className = "form-control mt-n2 text-primary bg-white";
basic_info_dispatch_remark.rows = 5;
basic_info_dispatch_remark.value =  is_null(record["Basic Info"]["log"].remark)  ? "" : record["Basic Info"]["log"].remark;
basic_info_dispatch_remark.maxLength = remark_max_length;
}
else
{
basic_info_external_id = document.createElement('h5');
basic_info_external_id.className = "text-center text-primary text-break";
basic_info_external_id.innerText =  is_null(record["Basic Info"].external_id) ? "-" : record["Basic Info"].external_id ;

basic_info_dispatch_remark = document.createElement('h5');
basic_info_dispatch_remark.className = "text-center text-primary text-break";
basic_info_dispatch_remark.innerText =  is_null(record["Basic Info"]["log"].remark) ? "-" : record["Basic Info"]["log"].remark ;

}

// Show Dispatch details if record status = 0 (complete) & it is edit mode or dispatch details are saved once

if(record["Basic Info"].status == 0 && (edit_mode || !is_null(record["Basic Info"]["log"].entry_by)) )
{
  line = document.createElement('hr');
  line.className = "col-sm-12 text-center";
  line.style = "width:60%";
  
  editable_param_card.appendChild(basic_info_external_id_title);
  editable_param_card.appendChild(basic_info_external_id);
  editable_param_card.appendChild(line);
  
  line = document.createElement('hr');
  line.className = "col-sm-12 text-center";
  line.style = "width:60%";
  
  editable_param_card.appendChild(basic_info_dispatch_remark_title);
  editable_param_card.appendChild(basic_info_dispatch_remark);
  editable_param_card.appendChild(line);
}


let footer_card = document.createElement('div');                        // div for footer items
footer_card.className = "col-sm-6 mx-auto text-center mt-2";

// Save / Update info button for edit_mode
if (edit_mode)
{
let save_btn = document.createElement('button');
  save_btn.className = "btn btn-outline-primary btn-block mt-2";
  save_btn.innerText = "Save / Update Data";

  let break_space = document.createElement('br');
  footer_card.appendChild(save_btn);
  footer_card.appendChild(break_space);

// function to create & encode record to save to database  
save_btn.onclick = async function()
{
  var result = await create_process_operation_record(editable_param_card, "Basic Info", record);
  if( result )
 {
  var select_container = document.getElementById("qc_stage_select_list");
  var qc_data_display_container = document.getElementById("serial_qc_data_display");
  await display_qc_stage_info_card(select_container, qc_data_display_container, gl_curr_record, false);
  display_info("Data saved successfully");
 }
}

}

container.appendChild(basic_info_card);
container.appendChild(editable_param_card);                             // contains parameters or values edited / updated by user
container.appendChild(footer_card);


}


// Called by display_qc_stage_info_card
//Function to create qc_stage_info card for set_serial_record_display
async function create_qc_stage_info_card(container, record, operation_name, edit_mode = false)
{
empty_container_byReference(container);


//no display if user doesn't have read access
if( gl_user_permission.admin != 1 && (gl_user_permission[operation_name] < 1 || is_null(gl_user_permission[operation_name]) ) ) 
{
// div to display insufficient permissions message to user
let insufficient_permission_card = document.createElement('div');                     
insufficient_permission_card.className = "col-sm-6 mx-auto text-center text-primary mt-2";
insufficient_permission_card.innerText = "You don't have sufficient permissions to view this section. Contact your administrator for access.";
container.appendChild(insufficient_permission_card);
return false;
}

let header_info_card = document.createElement('div');                     // div for items not edited / updated by user
header_info_card.className = "col-sm-6 mx-auto text-center mt-2";

let stage_status_title = document.createElement('p');
stage_status_title.className = "text-dark";
stage_status_title.innerText = "Operation Status";
header_info_card.appendChild(stage_status_title);

let stage_status = document.createElement('h4');
stage_status.className = status_list_color[record[operation_name].status] + " mb-2";
stage_status.innerHTML = status_list[record[operation_name].status] ;
header_info_card.appendChild(stage_status);

line = document.createElement('hr');
line.className = "col-sm-12 text-center";
line.style = "width:60%";        
header_info_card.appendChild(line);



let qc_stage_info_card = document.createElement('div');                 // div for parameters that are edited / updated by user
qc_stage_info_card.className = "col-sm-6 mx-auto text-center mt-2";
let param_list = await record[operation_name].param_list;
let tot_parameters = param_list.length;

for(i=0; i<tot_parameters; i++)
{
let parameter_title = document.createElement('div');
parameter_title.className = "row text-break mb-2";

if(!is_null(param_list[i].link))
parameter_title.innerHTML = '<div class="col-sm-12"><a class="btn btn-primary float-right pl-3 pr-3 rounded-circle" target="_blank" rel = "noopener nofollow external noreferrer"  href="' + 
param_list[i].link + '"><i class="fa fa-info"></i></a></div>';

parameter_title.innerHTML += '<div class="col-sm-12 text-dark">' + param_list[i].name + '</div>';


var actual_value;
var param_value = record[operation_name].actual_value[param_list[i].name][0];
if (param_value == undefined || param_value == "")
param_value = get_parameter_value_from_cache(record["Basic Info"].model, operation_name, param_list[i].name, param_list[i].freq, edit_mode);

var param_type = param_list[i].type;                      
var param_value1 = param_list[i].value1;
var param_value2 = param_list[i].value2;

if(edit_mode)                                                             // Create input field for edit mode
{
actual_value = await render_actual_value_input_field(param_type, param_value1, param_value2, param_value, record[operation_name].status, operation_name);
}
else
{
actual_value = document.createElement('h5');
actual_value.className = "text-center text-primary text-break";
if (param_value == "") param_value = "-";
actual_value.innerText = param_value;

if(record[operation_name].status == 1 || record[operation_name].status == 3)        // if Minor or major deviation present in current step
{
if( (await validate_input_field_value(param_type, param_value1, param_value2, param_value)) == false)    
// input field value is not validated
actual_value.className = "text-center text-danger font-weight-bold";                            // highlight value red
}

}

let parameter_info_div = document.createElement('div');
var parameter_description;

if (edit_mode) 
{
if (param_list[i].type === data_types[2])    //Sub-assembly part serial number    - Create scanner button for edit mode
{
parameter_description = document.createElement('div');

let scan_qr_btn = document.createElement('button');
scan_qr_btn.className = "btn btn-outline-dark";
scan_qr_btn.id = "scan-btn";
scan_qr_btn.innerText = "Scan QR";
scan_qr_btn.onclick = function(){popup_scanner(scan_qr_btn.parentElement.previousElementSibling);}

let criteria = document.createElement('div');
criteria.className = "text-primary mt-1";
criteria.innerHTML = "Enter <u>" + param_list[i].value1 + "</u> Type Job ID";

parameter_description.appendChild(scan_qr_btn);
parameter_description.appendChild(criteria);
}
else
{
parameter_description = document.createElement('div');
parameter_description.className = "text-primary";

if(param_list[i].type === data_types[0])          //Numeric Range Type
parameter_description.innerText = "Min Value: " + (param_list[i].value1 || "-").toString() + " , Max Value: " + (param_list[i].value2 || "-").toString();

else if (param_list[i].type === data_types[1])    //Option List - Display acceptable options
parameter_description.innerText = "Valid Options: " + param_list[i].value1;

else if (param_list[i].type === data_types[3])    // Free Response value
parameter_description.innerText = "Enter value (max 50 characters)";
}
}

else
{
parameter_description = document.createElement('div');
parameter_description.className = "text-muted";

if(param_list[i].type === data_types[0])          //Numeric Range Type
parameter_description.innerText = "Min Value: " + (param_list[i].value1 || "-").toString() + " , Max Value: " + (param_list[i].value2 || "-").toString();


else if (param_list[i].type === data_types[1])    //Option List - Display acceptable options
parameter_description.innerText = "Valid Options: " + param_list[i].value1;

else if (param_list[i].type === data_types[2])    //Sub-assembly part - serial number
parameter_description.innerHTML = "Enter <u>" + param_list[i].value1 + "</u> Type Job ID";

else if (param_list[i].type === data_types[3])    //Free Response
parameter_description.innerText = "Enter value (max 50 characters)";
}

parameter_info_div.appendChild(parameter_description);


let measurement_method = document.createElement('div');
measurement_method.className = (edit_mode == true) ? "text-primary text-break" : "text-muted text-break";
if(!is_null(param_list[i].method))
{
  measurement_method.innerText = "Measurement Method: " + param_list[i].method;
  parameter_info_div.appendChild(measurement_method);
}

line = document.createElement('hr');
line.className = "col-sm-12 text-center";
line.style = "width:60%";


qc_stage_info_card.appendChild(parameter_title);
qc_stage_info_card.appendChild(actual_value);
qc_stage_info_card.appendChild(parameter_info_div);
qc_stage_info_card.appendChild(line);

}

let footer_card = document.createElement('div');                 // div for items in footer. not edited / updated by user
footer_card.className = "col-sm-6 mx-auto text-center mt-2";


// Workstation select container setup
let workstation_name_select_title = document.createElement('p');
workstation_name_select_title.className = "text-dark";
workstation_name_select_title.innerText = "Workstation ID";

let workstation_name_select = "";

if(edit_mode)
{
  workstation_name_select = document.createElement("select"); 
  workstation_name_select.className = "custom-select text-center mb-5";

  if (is_null(gl_current_operations_list) )
  gl_current_operations_list = await read_production_operations_list();

  let workstation_options = gl_current_operations_list[operation_name] || [];

  // If no workstation names or operation was deleted from gl_current_operations_list then use "default" workstation  
  if( is_null(workstation_options) )
  {
    set_select_options(workstation_name_select, ["-"]);
    workstation_name_select.value = "-";
  }
  else
  {
    set_select_options(workstation_name_select, [""].concat(workstation_options) );
    if(!is_null(record[operation_name].workstation))
    workstation_name_select.value = record[operation_name].workstation;
    else
    workstation_name_select.value = "";
  }

}
else
{
  workstation_name_select = document.createElement('p');
  workstation_name_select.className = "text-primary text-break";

  if(record[operation_name].workstation == "" || is_null(record[operation_name].workstation))
  workstation_name_select.innerText = "-";
  else
  workstation_name_select.innerText = record[operation_name].workstation;

  workstation_name_select.value = record[operation_name].workstation || "-";
}

let break_space = document.createElement('br');


footer_card.appendChild(workstation_name_select_title);
footer_card.appendChild(workstation_name_select);
footer_card.appendChild(break_space);




var current_step_index = (Object.keys(record)).indexOf(operation_name);

// Save / Update info button for edit_mode
if (edit_mode && record["Basic Info"].status != 4 && (current_step_index <= (current_process_status(record)).operation_index || record[operation_name].status != 2 )  )
{
let save_btn = document.createElement('button');
save_btn.className = "btn btn-outline-primary btn-block mt-2";
save_btn.innerText = "Save / Update Data";

break_space = document.createElement('br');
footer_card.appendChild(save_btn);
footer_card.appendChild(break_space);

// function to create & encode record to save to database  
save_btn.onclick = async function()
{
  var result = await create_process_operation_record(qc_stage_info_card, operation_name, record, workstation_name_select.value);
 if( result )
 {
  var select_container = document.getElementById("qc_stage_select_list");
  var qc_data_display_container = document.getElementById("serial_qc_data_display");
  await display_qc_stage_info_card(select_container, qc_data_display_container, gl_curr_record, false);
  display_info("Data saved successfully");
 }
}
}

container.appendChild(header_info_card);  
container.appendChild(qc_stage_info_card);                        // contains parameters edited / updated by user
container.appendChild(footer_card);

}


// Function to create previous_pending_info_card to indicate previous stage pending message
function create_previous_pending_info_card(container, pending_operation)
{
empty_container_byReference(container);

let header_info_card = document.createElement('div');                     // div for items not edited / updated by user
header_info_card.className = "col-sm-6 mx-auto text-center mt-2";

let stage_status = document.createElement('p');
stage_status.className = "text-center text-danger font-weight-bold";
stage_status.innerText = "'" + pending_operation + "' has to be completed before this step. Check 'Basic Info' section for more info.";
header_info_card.appendChild(stage_status);
container.appendChild(header_info_card);
}


//Function to show qc_stage or basic _info display card
async function display_qc_stage_info_card(select_container, qc_data_display_container, record, edit_mode = false)
{
empty_container_byReference(qc_data_display_container);


if(select_container.value == "Basic Info") 
{
await create_basic_info_card(select_container, qc_data_display_container, record, false);
}
else 
{
var process_status = current_process_status(record);
var operation_list = process_status.operation_list;
var current_operation = process_status.current_operation;
var operation_to_display_index = operation_list.indexOf(select_container.value);
var current_operation_index = process_status.operation_index;
var current_status_value = process_status.current_status_value;             // 0 indicates all steps completed

// Previous step is pending 
if(current_status_value != 0 && operation_to_display_index > current_operation_index && record[select_container.value].status > 0)     
{
  await create_previous_pending_info_card(qc_data_display_container, current_operation);  // displays previous step pending message
  return;
}

else
await create_qc_stage_info_card(qc_data_display_container, record, select_container.value, false);
}


//Show Action button to edit / save data based on user permissions & current edit_mode value. 1 = read, 2 = write, 3 = edit
if(edit_mode != true)      // Not in edit mode & status is not rejected
{
let edit_card = document.createElement('div');                 // div for edit_button, allow_deviation_btn, reject_btn, change_log_btn
edit_card.className = "col-sm-6 mx-auto text-center mt-2";

  // write / update access available - edit, deviation & reject btn
  if(
      (       
            // user is admin
            gl_user_permission.admin == 1
            // user has write permission & stage record is not entered yet
            || (record[select_container.value].log.entry_by == "" && gl_user_permission[select_container.value]>1)   
            // or user has update permission for stage record
            || (gl_user_permission[select_container.value]>2)              
      )  
      &&
      (
            // and part is not rejected & process is not completed (0-status) or it is "Basic Info" section
            (record["Basic Info"].status < 4) && ( (record["Basic Info"].status > 0) || select_container.value == "Basic Info" )
      )
    )

  {

      let edit_btn = document.createElement('button');               // create edit_btn
      edit_btn.className = "btn btn-outline-primary btn-block";
      edit_btn.innerText = "Edit Data";

      // Modify edit_btn text if mode = "Basic Info"
      if(select_container.value == "Basic Info")
      edit_btn.innerText = "Add / Edit Dispatch Details";


      edit_btn.onclick = async function()
      {
        if(select_container.value == "Basic Info") await create_basic_info_card(select_container, qc_data_display_container,record, true);
        else await create_qc_stage_info_card(qc_data_display_container, record, select_container.value, true);
      }

      let break_space = document.createElement('br');

      // For "Basic Info" mode, show edit button only if record status = 0 (complete). FOr other modes show if record status != 0 & != 4 (as per above)

      if(select_container.value!= "Basic Info" || (select_container.value == "Basic Info" && record["Basic Info"].status == 0) )
      {
        edit_card.appendChild(edit_btn);
      
        edit_card.appendChild(break_space);  
      }


      // Show deviation button if user is admin or has edit/ update permission & record has minor (1) or major (3) deviation status
      // no deviation or rejection for Basic Info section
      if( (gl_user_permission.admin == 1 || gl_user_permission[select_container.value]>2) 
       && (record[select_container.value].status == 1 || record[select_container.value].status == 3) 
       && select_container.value != "Basic Info")
      {
      let allow_deviation_btn = document.createElement('button');               // allow_deviation_btn
      allow_deviation_btn.className = "btn btn-outline-primary btn-block";
      allow_deviation_btn.innerText = "Allow Deviation";

      allow_deviation_btn.onclick = async function()                                  // function to display deviation modal message
      {
       var result = await deviation_confirmation(select_container.value, allow_deviation_operation_record, record);
      }

      break_space = document.createElement('br');

      edit_card.appendChild(allow_deviation_btn);
      edit_card.appendChild(break_space);


      let reject_deviation_btn = document.createElement('button');               // reject_deviation_btn
      reject_deviation_btn.className = "btn btn-outline-primary btn-block";
      reject_deviation_btn.innerText = "Reject Part";

      reject_deviation_btn.onclick = async function()                                  // function to display deviation modal message
      {
        var result = await rejection_confirmation(select_container.value, allow_rejection_operation_record, record);
      }

      break_space = document.createElement('br');

      edit_card.appendChild(reject_deviation_btn);
      edit_card.appendChild(break_space);

      }

  }


  // read access available - show-change-log-button - if user is admin or has read permission(1) or higher for stage OR stage == 'Basic Info'
  if(gl_user_permission.admin == 1 || gl_user_permission[select_container.value]>0 || select_container.value == "Basic Info")                      
{

let show_change_log_btn = document.createElement('button');               // show_change_log_btn
show_change_log_btn.className = "btn btn-outline-primary btn-block";
show_change_log_btn.innerText = "View Change Log";

let break_space = document.createElement('br');

edit_card.appendChild(show_change_log_btn);
edit_card.appendChild(break_space);

show_change_log_btn.onclick = function() 
  { 
    var message = "";
 
    // first entry saved details 
    if (gl_curr_record[select_container.value].log.entry_by != "" && gl_curr_record[select_container.value].log.entry_by != undefined)
    {
    var name = gl_curr_record[select_container.value].log.entry_by;  
    var full_date = decode_date(gl_curr_record[select_container.value].log.entry_dt);

    message = message + "Data entered by " + name + " on " + full_date + ".<hr>";
    }
   
    // last entry update details 
    if (gl_curr_record[select_container.value].log.update_by != "" && gl_curr_record[select_container.value].log.update_by != undefined)
    {
    var name = gl_curr_record[select_container.value].log.update_by;  
    var full_date = decode_date(gl_curr_record[select_container.value].log.update_dt);

    message = message + "Last updated by " + name  + " on " + full_date + ".<hr>";
    }
    // deviation details 
    if (gl_curr_record[select_container.value].log.deviation_by != "" && gl_curr_record[select_container.value].log.deviation_by != undefined)
    {
    var name = gl_curr_record[select_container.value].log.deviation_by;  
    var full_date = decode_date(gl_curr_record[select_container.value].log.deviation_dt);
    var remark = gl_curr_record[select_container.value].log.remark;
    
    var message_starting = "Deviation allowed by ";
    if(gl_curr_record[select_container.value].status == 4)                     // if rejected
    message_starting = "Rejected by ";
   
    message = message + message_starting + name + " on " + full_date + ". Remarks- " + remark + "<hr>";
    }
   
   
   if (message == "") message = "No changes yet!"; 
   

    display_info(message); 

  }
}


// Dispatch QR label Download button
if(select_container.value == "Basic Info" && record["Basic Info"].log.entry_by != "")                      
{
let dispatch_qr_label_download_btn = document.createElement('button');               // dispatch_qr_label_btn - download QR label as per dispatch id
dispatch_qr_label_download_btn.className = "btn btn-outline-primary btn-block";
dispatch_qr_label_download_btn.innerText = "Download Dispatch QR Label";

let break_space = document.createElement('br');

edit_card.appendChild(dispatch_qr_label_download_btn);
edit_card.appendChild(break_space);

dispatch_qr_label_download_btn.onclick = async function() {await create_qr_label_pdf(record["Basic Info"].external_id, record["Basic Info"].model, record["Basic Info"].log.entry_dt); }

}

// Process Record PDF Download button
if(select_container.value == "Basic Info")                      
{
let process_record_pdf_btn = document.createElement('button');               // process_record_pdf_btn - download PDF of record
process_record_pdf_btn.className = "btn btn-outline-primary btn-block";
process_record_pdf_btn.innerText = "Download Record PDF";

let break_space = document.createElement('br');

edit_card.appendChild(process_record_pdf_btn);
edit_card.appendChild(break_space);

process_record_pdf_btn.onclick = function() { create_process_record_pdf(record); }

}


qc_data_display_container.appendChild(edit_card);

}


}


// Function to set & display data for create / update serial number record section
async function set_serial_record_display(record)
{
document.getElementById("navigation_update_serial_2_number").innerHTML = "Record for Serial No: " + record["Basic Info"].serial + "<br/>(" + record["Basic Info"].model + ")"; 

var stage_list = Object.keys(record); 


var select_container = document.getElementById("qc_stage_select_list");
var qc_data_display_container = document.getElementById("serial_qc_data_display");
await empty_container_byReference(select_container);
await empty_container_byReference(qc_data_display_container);


set_select_options(select_container, stage_list);
await display_qc_stage_info_card(select_container, qc_data_display_container, record);


//add listeners to navigate between cards of different qc_stages
select_container.onchange = async function()
{
  await display_qc_stage_info_card(select_container, qc_data_display_container, gl_curr_record);
}
      

btn_next_qc_stage_select.onclick = async function()
{
  var current_stage = select_container.value;
  var current_index = stage_list.indexOf(current_stage);

  if(current_index < stage_list.length - 1) 
  {
  current_index = current_index + 1;
  select_container.value = stage_list[current_index];

  await display_qc_stage_info_card(select_container, qc_data_display_container, gl_curr_record, false);
  }
}

btn_prev_qc_stage_select.onclick = async function()
{
  var current_stage = select_container.value;
  var current_index = stage_list.indexOf(current_stage);

  if(current_index >0 ) 
  {
  current_index = current_index - 1;
  select_container.value = stage_list[current_index];

  await display_qc_stage_info_card(select_container, qc_data_display_container, gl_curr_record, false);
  }
}

}



// Function to retrive all data for given serial number       
async function get_serial_history(field_id)
{
var serial_number = document.getElementById(field_id).value;

if(validate_serial_number(serial_number) == true)
gl_curr_record = await read_serial_number_record(serial_number);  //record - global var
else return false;

if (gl_curr_record == false) {display_error("Serial Number not found."); return;}
else
{
set_serial_record_display(gl_curr_record);

document.getElementById("navigation_update_serial_1").style.display = "none";
document.getElementById("navigation_update_serial_2").style.display = "block";

}
}


/////////////////////////////////////////////////
// Support Functions for Parameter Values Cache//
/////////////////////////////////////////////////

// Support Function to remove expired parameter values from cache
function reset_cache_expired_parameters()
{
  const cache_param_values_list = Object.keys(gl_parameter_cache);

  for(var i=0;i<cache_param_values_list.length; i++)
  { 
    //if time expired, reset freq_remaining to 0
    if( (new Date() - gl_parameter_cache[cache_param_values_list[i]].record_time)/(1000*60*60) > gl_parameter_cache_expiry_hours )
    {
      gl_parameter_cache[cache_param_values_list[i]].freq_remaining = 0;
    }
  }
  return true;
}

// Checks if non expired value for frequency sampling based parameter is in cache & returns value
function get_parameter_value_from_cache(model,operation,parameter_desc,param_frequency, edit_mode)
{
  if(edit_mode == false || param_frequency<=1) return ""; // Only display mode or uncached parameter

  reset_cache_expired_parameters();
  const param_name = model + "." + operation + "." + parameter_desc;

  //If value is expired or not present return 0
  if(gl_parameter_cache[param_name] == undefined || (new Date() - gl_parameter_cache[param_name].record_time)/(1000*60*60) > gl_parameter_cache_expiry_hours || 
     gl_parameter_cache[param_name].freq_remaining <= 0 )
     return "";
  //else return cached value
  else return gl_parameter_cache[param_name].value;   
}

// Checkes if parameter value is from cache (return 1) or not (returns 0) when saving operation parameter values 1st time
function get_cache_flag_value_on_record_save(model,operation,parameter_desc,value,param_frequency)
{
  if(param_frequency<=1)return 0;        // uncached parameter

  const param_name = model + "." + operation + "." + parameter_desc;

  if(gl_parameter_cache[param_name] == undefined || gl_parameter_cache[param_name].value != value || gl_parameter_cache[param_name].freq_remaining <= 0 )
  return 0;
  // else parameter value is from cache
  else return 1;
}

// Checkes if parameter value is from cache (return 1) or not (returns 0) when updateing operation parameter values
function get_cache_flag_value_on_record_update(old_value, new_value, old_flag)
{
  if(old_flag == 0) return 0;
  else if (old_flag == 1 && old_value != new_value) return 0;
  else return 1;
}

function update_cache(model, operation, updated_record)
{
  var param_list = updated_record[operation].param_list;

  for(var i=0; i<param_list.length; i++)
  {
    if(param_list[i].freq != undefined && param_list[i].freq > 1)
    {
      const param_name = model + "." + operation + "." + param_list[i].name;
      const final_value = updated_record[operation].actual_value[param_list[i].name][0];

      if(gl_parameter_cache[param_name] == undefined || gl_parameter_cache[param_name].freq_remaining <=0 ||
         gl_parameter_cache[param_name].value != final_value )
         {
          gl_parameter_cache[param_name] ={
                                            "value": final_value,
                                            "freq_remaining": param_list[i].freq-1,
                                            "record_time": new Date()
                                          };
         }
      else if(gl_parameter_cache[param_name] != undefined && gl_parameter_cache[param_name].freq_remaining >0 &&
        gl_parameter_cache[param_name].value == final_value )
        {
          gl_parameter_cache[param_name].freq_remaining = gl_parameter_cache[param_name].freq_remaining - 1;
        }
    }
  }


}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                             View / Report Process Disruptions                                      //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////     

//Function to initialize process disruptions section
async function initialize_process_disruption_section()
{
await reset_sections();
const report_process_disruption_container = document.getElementById("report_process_disruption_section");
const view_process_disruptions_container = document.getElementById("view_process_disruptions_section");
await empty_container_byReference(report_process_disruption_container);
await empty_container_byReference(view_process_disruptions_container);
await empty_container_byReference(report_process_disruption_container);
await empty_container_byReference(view_process_disruptions_container);

// error if user is not authorised to create serial number
if(gl_user_permission.admin != 1 && gl_user_permission[section_permission_list["Report Process Disruptions"]] != 1) 
{
display_error("You do not have sufficient permissions for this operation.");
return false;
}

if (gl_disruption_alerts==undefined) await subscribe_alert_notifications();
else
{
  await render_disruption_input_section();
  await render_active_disruptions_section();
}


}

// Function to get any active process disruptions reported by current user or for which user has notification access
async function get_current_user_active_disruption_records()
{
  const disruption_list = gl_disruption_alerts;
  var curr_user_disruption_list = [];                // check if any disruption record exists for current user email

  for(var i=0; i<disruption_list.length; i++)
  {
    if(disruption_list[i].start_user == gl_curr_user_details.email || gl_user_permission[disruption_list[i].operation + "_an"] == 1)
    curr_user_disruption_list.push(disruption_list[i]);
  }

return curr_user_disruption_list;
}

// Function to display disruption input section to user if no current disruption is reported by user
async function render_disruption_input_section()
{
  const report_process_disruption_container = document.getElementById("report_process_disruption_section");
  await empty_container_byReference(report_process_disruption_container);

  if( is_null(gl_current_operations_list) )
  gl_current_operations_list = await read_production_operations_list();  

  var operation_name_list = Object.keys(gl_current_operations_list)

  var permitted_operations = [];
  for(var i=0; i<operation_name_list.length; i++)
  {
    // get operations where user is allowed to read or has admin permission
    if(gl_user_permission.admin == 1 || gl_user_permission[operation_name_list[i]] >= 1)
    permitted_operations.push(operation_name_list[i]);
  }


  
  var reason_group = document.createElement('div');
  reason_group.className = "form-row justify-content-center mt-4";
  
  var reason_desc = document.createElement("p");
  reason_desc.className = "col mb-2 text-primary";
  reason_desc.innerText = "Select Reason";
  reason_group.appendChild(reason_desc);
  
  var reason_value = document.createElement("select");
  reason_value.className = "custom-select mb-2 text-center col-sm-6";
  set_select_options(reason_value, [" "].concat(disruption_reasons));
  reason_group.appendChild(reason_value);
  
  var operation_group = document.createElement('div');
  operation_group.className = "form-row justify-content-center mt-2";
  
  var operation_desc = document.createElement("p");
  operation_desc.className = "col mb-2 text-primary";
  operation_desc.innerText = "Select Operation";
  operation_group.appendChild(operation_desc);
  
  var operation_value = document.createElement("select");
  operation_value.className = "custom-select mb-2 text-center col-sm-6";
  set_select_options(operation_value,[" "].concat(permitted_operations));
  operation_group.appendChild(operation_value);
  
  var workstation_group = document.createElement('div');
  workstation_group.className = "form-row justify-content-center mt-2";
  
  var workstation_desc = document.createElement("p");
  workstation_desc.className = "col mb-2 text-primary";
  workstation_desc.innerText = "Select Workstation";
  workstation_group.appendChild(workstation_desc);
  
  var workstation_value = document.createElement("select");
  workstation_value.className = "custom-select mb-2 text-center col-sm-6";
  set_select_options(workstation_value, [" "]);
  workstation_group.appendChild(workstation_value);
  
  var remark_group = document.createElement('div');
  remark_group.className = "form-row justify-content-center mt-2";
  
  var remark_desc = document.createElement("p");
  remark_desc.className = "col mb-2 text-primary";
  remark_desc.innerText = "Enter Remark";
  remark_group.appendChild(remark_desc);
  
  var remark_value = document.createElement("input");
  remark_value.className = "form-control mb-2 text-center col-sm-6";
  remark_value.maxLength = param_value_max_length;
  remark_group.appendChild(remark_value);

  //Display message with current active disruptions reported by user
  var curr_user_disruption_list = await get_current_user_active_disruption_records();                // check if any disruption record exists for current user email

  var current_active_disruptions = document.createElement("p");
  current_active_disruptions.className = "col mb-2 mt-4 text-danger";
  current_active_disruptions.innerText = curr_user_disruption_list.length + " Active Process Disruption(s) Reported by you";

  var submit_btn = document.createElement("div");
  submit_btn.className = "btn btn-primary btn-block mt-4";
  submit_btn.innerText = "Report Process Disruption";                                     
  

  report_process_disruption_container.appendChild(reason_group);
  report_process_disruption_container.appendChild(operation_group);
  report_process_disruption_container.appendChild(workstation_group);
  report_process_disruption_container.appendChild(remark_group);
  report_process_disruption_container.appendChild(submit_btn);

  if(curr_user_disruption_list.length>0) report_process_disruption_container.appendChild(current_active_disruptions);


  operation_value.onchange = function(){
                                          empty_container_byReference(workstation_value);   
                                          set_select_options(workstation_value,gl_current_operations_list[operation_value.value] || [" "]);
                                       }
  

  
  submit_btn.onclick = async function(){
                                    // validate data  
                                    if( is_null(reason_value.value, [" "]) || is_null(operation_value.value, [" "]) || is_null(workstation_value.value, [" "]) )
                                    {
                                      display_error("Please fill all fields before submitting");
                                      return false;
                                    }
  
                                    await display_confirmation("Are you sure you want to Report Process Disruption",
                                    await_loading, create_process_disruption_record,reason_value.value, operation_value.value, workstation_value.value, remark_value.value );
  //                                  await initialize_process_disruption_section();
                                    return true;
                                 }
  return true;
}

// Function to display current active process diruptions (all or generated by self depending on permissions)
async function render_active_disruptions_section()
{
  const view_process_disruptions_container = document.getElementById("view_process_disruptions_section");
  await empty_container_byReference(view_process_disruptions_container);

  var notification_list = [];
  
  if(gl_user_permission.admin == 1) notification_list = gl_disruption_alerts;
  
  else notification_list = await get_current_user_active_disruption_records();

  if(notification_list.length <= 0)
  {
    let message = document.createElement("div");
    message.className = "text-primary mt-4";
    message.innerText = "No active process disruptions";
    view_process_disruptions_container.appendChild(message);
    return true;
  }

  else for(var i=0; i<notification_list.length; i++)
  {
    let notification_card = document.createElement("div");
    notification_card.className = "card mt-3 mb-3";
    notification_card.id = notification_list[i].id;

    let notification_card_body = document.createElement("div");
    notification_card_body.className = "card-body text-center";

    let elapsed_time_section = document.createElement("div");
    elapsed_time_section.className = "text-dark text-right";
    elapsed_time_section.innerHTML = "<br>";

    setInterval(display_elapsed_time, 1000, notification_list[i].start_time, elapsed_time_section );

    let reason_section = document.createElement("div");
    reason_section.className = "text-center text-danger mt-2 mb-3 h5";
    reason_section.innerText = notification_list[i].reason;

    let operation_section = document.createElement("div");
    operation_section.className = "mb-2 text-dark";
    operation_section.innerHTML = "Operation & Workstation<br>";

    let operation_value = document.createElement("div");
    operation_value.className = "text-primary";
    operation_value.innerText = notification_list[i].operation + " | " + notification_list[i].workstation;

    operation_section.appendChild(operation_value);

    let reported_by_section = document.createElement("div");
    reported_by_section.className = "mb-2 text-dark";
    reported_by_section.innerHTML = "Reported By<br>";

    reported_by_value = document.createElement("div");
    reported_by_value.className = "text-primary";
    reported_by_value.innerText = notification_list[i].start_user;
    reported_by_section.appendChild(reported_by_value);

    let remark_section = document.createElement("div");
    remark_section.className = "mb-2 text-dark";
    remark_section.innerHTML = "Remark<br>";

    remark_value = document.createElement("div");
    remark_value.className = "text-primary text-break";
    remark_value.innerText = notification_list[i].remark;
    remark_section.appendChild(remark_value);    

    let disruption_fixed_btn = document.createElement("div");
    disruption_fixed_btn.className = "btn btn-block btn-primary";
    disruption_fixed_btn.innerText = "Disruption Fixed";

    disruption_fixed_btn.onclick = async function() { 
                                                      await display_confirmation("Are you sure you want to mark disruption as fixed ?",
                                                              await_loading, close_process_disruption_record, notification_card.id); 
                                                    };

    notification_card_body.appendChild(elapsed_time_section);
    notification_card_body.appendChild(reason_section);
    notification_card_body.appendChild(document.createElement("hr"));
    notification_card_body.appendChild(operation_section);
    notification_card_body.appendChild(reported_by_section);
    
    if(remark_value.innerText.length>0)
    notification_card_body.appendChild(remark_section);
    
    notification_card_body.appendChild(disruption_fixed_btn);
    
    notification_card.appendChild(notification_card_body);
    view_process_disruptions_container.appendChild(notification_card);
  }


}



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                      View / Update Scheduled Maintenance Status                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////     

//Function to initialize maintenance updates section
async function initialize_maintenance_updates_section(mode=0)
{
  await reset_sections();
  const maintenance_update_container = document.getElementById("maintenance_update_container_dynamic");
  await empty_container_byReference(maintenance_update_container);

  // error if user is not authorised to create serial number
  if(gl_user_permission.admin != 1 && gl_user_permission[section_permission_list["Update Maintenance Records"]] != 1) 
  {
  display_error("You do not have sufficient permissions for this operation.");
  return false;
  }

  if(mode==0)
  gl_maintenance_updates_list = await read_global_maintenance_updates();

  // Setup Preventive Maintenance Section
  if(is_null(gl_maintenance_updates_list) ) 
  {
    var help_notice = document.createElement("div");
    help_notice.className="text-danger";
    help_notice.innerText = "No preventive maintenance scheduled for workstations. Please setup in Maintenance Settings.";
    maintenance_update_container.appendChild(help_notice);
  }

  else
  {
    var workstation_names_list = Object.keys(gl_maintenance_updates_list);
    for(i=0;i<workstation_names_list.length; i++)
    {
      let main_col_container = document.createElement('div');
      main_col_container.className = "col-md-4";


      const last_update = new Date(decode_date(gl_maintenance_updates_list[workstation_names_list[i]].last_update,1));
      const maintenance_due_date_string = new Date (last_update.setDate(last_update.getDate() + gl_maintenance_updates_list[workstation_names_list[i]].cycle_time));
      const today_date = new Date();
      const maintenance_due_in_days = ((maintenance_due_date_string - today_date)/(1000*60*60*24)).toFixed(1);
      const highlight_text_color = (maintenance_due_in_days>=0) ? " text-primary" : " text-danger" ;                   // set based on maintenance due date
      const maintenance_due_message = (maintenance_due_in_days>=0) ?  "Maintenance Due in" : "Maintenace Overdue by" ;

      //create card & button & due dates
      let maintenance_card = document.createElement('div');
      maintenance_card.className = "card p-2 mb-3";
      
      let maintenance_card_header = document.createElement('div');
      maintenance_card_header.className = "card-header bg-white" + highlight_text_color;
      maintenance_card_header.innerHTML = "<h4>" + workstation_names_list[i] + "</h4>";
      
      let maintenance_card_body = document.createElement('div');
      maintenance_card_body.className= "card-body";

      let maintenance_message = document.createElement('div');
      maintenance_message.className="text-dark mb-1";
      maintenance_message.innerHTML = maintenance_due_message + "<br>";

      let maintenance_days_display = document.createElement('div');
      maintenance_days_display.className="h2"+highlight_text_color;
      maintenance_days_display.innerText = Math.abs(maintenance_due_in_days);
      
      let maintenance_days_ending = document.createElement('div');  
      maintenance_days_ending.className="text-dark mb-1";
      maintenance_days_ending.innerText = "Days";

      let maintenance_date_display = document.createElement('div');
      maintenance_date_display.innerHTML = "Due Date: " + maintenance_due_date_string.toDateString() + "<br>";

      let maintenance_submit_update_btn = document.createElement('div');
      maintenance_submit_update_btn.className = "btn btn-primary btn-block mt-3";
      maintenance_submit_update_btn.innerText = "Update Status";
      maintenance_submit_update_btn.id = workstation_names_list[i];
      maintenance_submit_update_btn.onclick = async function(){
                                                                const selected_workstation_id = maintenance_submit_update_btn.id;
                                                                await await_loading(create_maintenance_update_modal,selected_workstation_id, "Preventive");
                                                              };

      maintenance_card_body.appendChild(maintenance_message);
      maintenance_card_body.appendChild(maintenance_days_display);
      maintenance_card_body.appendChild(maintenance_days_ending);
      maintenance_card_body.appendChild(maintenance_date_display);
      maintenance_card_body.appendChild(maintenance_submit_update_btn);

      maintenance_card.appendChild(maintenance_card_header);
      maintenance_card.appendChild(maintenance_card_body);
      main_col_container.appendChild(maintenance_card);

      maintenance_update_container.appendChild(main_col_container);

    } 
  }


  // Setup Corrective Maintenance Section
  if( is_null(gl_current_operations_list) )
  gl_current_operations_list = await read_production_operations_list();
  
  var workstation_select_list = get_workstation_names_from_operations_obj(gl_current_operations_list);

  let corrective_maintenance_workstation_select_container = document.getElementById("select_workstation_corrective_maintenance_section");
  await empty_container_byReference(corrective_maintenance_workstation_select_container);
  await set_select_options (corrective_maintenance_workstation_select_container, workstation_select_list);

  corrective_maintenance_add_update_btn.onclick = async function()
      {
        const selected_workstation_id = document.getElementById("select_workstation_corrective_maintenance_section").value;
        await await_loading(create_maintenance_update_modal,selected_workstation_id, "Corrective");  
      }


}

//Function to create modal to submit maintenance update entry
async function create_maintenance_update_modal(workstation_id, maintenance_update_type="Preventive")
{
  var maintenance_modal_title_container = document.getElementById("maintenance_modal_title_section");
  var maintenance_modal_params_container = document.getElementById("maintenance_modal_params_section");
  var maintenance_modal_remark_container = document.getElementById("maintenance_modal_remark_section");
  var maintenance_modal_error_container = document.getElementById("maintenance_modal_error_message_section");
 
  maintenance_modal_title_container.innerHTML = "";
  maintenance_modal_error_container.innerText= "";
  empty_container_byReference(maintenance_modal_params_container);
  empty_container_byReference(maintenance_modal_remark_container);

  maintenance_modal_title_container.innerHTML = "<h5>" + maintenance_update_type + " Maintenance Update for " + workstation_id + "</h5>";

  if(maintenance_update_type == "Preventive")
  {
    gl_curr_maintenance_plan = await read_maintenance_plan(workstation_id);
    const param_list = gl_curr_maintenance_plan.param_list;

    for(var i=0; i<param_list.length; i++)
    {

      let parameter_title = document.createElement('div');
      parameter_title.className = "row text-break mb-2";
      
      if(!is_null(param_list[i].link))
      parameter_title.innerHTML = '<div class="col-sm-12"><a class="btn btn-primary float-right pl-3 pr-3 rounded-circle" target="_blank" rel = "noopener nofollow external noreferrer"  href="' + 
      param_list[i].link + '"><i class="fa fa-info"></i></a></div>';
      
      parameter_title.innerHTML += '<div class="col-sm-12 text-dark mb-2">' + param_list[i].name + '</div>';
      
      var actual_value = await render_actual_value_input_field(param_list[i].type, param_list[i].value1, param_list[i].value2, "");

      let parameter_description = document.createElement('div');
      parameter_description.className = "text-primary";
      
      if(param_list[i].type === data_types[0])          //Numeric Range Type
      parameter_description.innerText = "Min Value: " + (param_list[i].value1 || "-").toString() + " , Max Value: " + (param_list[i].value2 || "-").toString();
      
      else if (param_list[i].type === data_types[1])    //Option List - Display acceptable options
      parameter_description.innerText = "Valid Options: " + param_list[i].value1;
      
      else if (param_list[i].type === data_types[3])    // Free Response value
      parameter_description.innerText = "Enter value (max 50 characters)";      

      let line = document.createElement('hr');
      line.className = "col-sm-12 text-center";
      line.style = "width:60%";      

      maintenance_modal_params_container.appendChild(parameter_title);
      maintenance_modal_params_container.appendChild(actual_value);
      maintenance_modal_params_container.appendChild(parameter_description);
      maintenance_modal_params_container.appendChild(line);

    }
  }

  let remark_title = document.createElement('div');
  remark_title.className = "text-center text-dark text-break mt-3 mb-2";
  remark_title.innerText = "Details of " + maintenance_update_type + " Maintenance done";

  let remark_input = document.createElement('textarea');
  remark_input.className = "form-control mb-3";
  remark_input.rows = 5;
  remark_input.maxlength = 250;

  maintenance_modal_remark_container.appendChild(remark_title);
  maintenance_modal_remark_container.appendChild(remark_input);

  maintenance_modal_submit_btn.onclick = async function() 
                                { 
                                  const param_list = gl_curr_maintenance_plan.param_list;

                                  let param_actual_value_list = {};

                                  if(maintenance_update_type == "Preventive")
                                  {
                                    for(var i=0; i<param_list.length; i++)
                                    {
                                      var actual_value = maintenance_modal_params_container.childNodes[1 + i*4].value;
                                      console.log(actual_value);
                                      if(await validate_input_field_value(param_list[i].type, param_list[i].value1, param_list[i].value2, actual_value))
                                        {
                                          param_actual_value_list[param_list[i].name] = actual_value;
                                        }
                                      else
                                        {
                                          maintenance_modal_error_container.innerText = "Please check parameter input values";
                                          return false;
                                        }
                                    }
                                  }


                                  var remark = remark_input.value;

                                  if(remark.length<=0)
                                    {
                                      maintenance_modal_error_container.innerText = "Please add details of maintenance work";
                                      return false;
                                    }

                                  const maintenance_record_obj = {
                                                                    "type" : maintenance_update_type,
                                                                    "workstation" : workstation_id,
                                                                    "user" : gl_curr_user_details.email,
                                                                    "timestamp" : firebase.firestore.FieldValue.serverTimestamp(),
                                                                    "remark" : remark,
                                                                    "param_list" : param_actual_value_list
                                                                 };

                                  await await_loading(write_maintenance_record,maintenance_record_obj);
                                  return true;
                                };

  maintenance_modal_params_container.onchange = function() { maintenance_modal_error_container.innerText = ""; }

  await dismiss_all_modals();  
$("#maintenance_updateModal").modal();    
}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                     Configure QC plan for Parts / Models Section                                   //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


//Function to initialize QC plan section
async function initialize_create_qc_plan_section()
{
  await reset_sections();

// error if user is not authorised to configure process plan
if(gl_user_permission.admin != 1 && gl_user_permission.sp_system_settings != 1) 
{
display_error("You do not have sufficient permissions for this operation.");
return false;
}

document.getElementById("navigation_model_qc_plans_2").style.display = "none";
document.getElementById("navigation_model_qc_plans_1").style.display = "flex";

let model_select_container = document.getElementById("select_model_id_qc_plan_section");
let model_id_container = document.getElementById("model_id_qc_plan_section");

empty_container_byReference(model_select_container);

if( is_null(gl_model_list) )
gl_model_list = await read_model_list();

for (var i =0; i<gl_model_list.length; i++)
{
let model_option = document.createElement('option');
model_option.innerText = gl_model_list[i];
model_select_container.appendChild(model_option);
}

model_select_container.value = "";  model_id_container.value = "";
model_select_container.onchange = function(){ model_id_container.value = model_select_container.value; };
model_id_container.onchange = function(){model_select_container.value = ""; };

}



//Function to get unused / remaining operations when setting up QC Plan
function get_unused_operations(container)
{
var used_operations_list = [];
var unused_operations_list = [];

if( is_null(gl_current_operations_list) )
gl_current_operations_list = read_production_operations_list();

current_operations_list = Object.keys(gl_current_operations_list);

for (var i = 0; i<container.childElementCount; i++ )
{
if (container.childNodes[i].childNodes[0].childNodes[1].value !== "")
used_operations_list.push (container.childNodes[i].childNodes[0].childNodes[1].value);
}

for(var i=0; i<current_operations_list.length; i++)
{
if (!used_operations_list.includes (current_operations_list[i]) )
unused_operations_list.push(current_operations_list[i]);
}

return unused_operations_list;
}



//Function to dynamically add stages in a qc plan
async function add_qc_stage()
{
var container = document.getElementById("create_qc_plan_dynamic");
var index = container.childElementCount;

if( is_null(gl_current_operations_list) )
gl_current_operations_list = await read_production_operations_list();

var current_operations_list = Object.keys(gl_current_operations_list);

if (index+1 > max_qc_stages) 
  {display_error("Max limit reached. Only " + max_qc_stages + " QC stages allowed")}
else if (index+1 > current_operations_list.length) 
  {display_error("No operations remaining. Add more in 'Configure Production Operations' before continuing")}
else{
  let card = document.createElement('div');
  card.className = 'col-sm-4 card shadow cursor-pointer mb-2 justify-content-center text-center';
  card.id = "qc_step"+index;
  card.name = "qc_step_group";

  let cardHeader = document.createElement('div');
  cardHeader.className = 'card-header';

  let title = document.createElement('h5');
  title.innerText = "Step "+(index+1) + " Operation:";
  title.className = 'card-title';


  let qc_stage_description = document.createElement("select"); 
  qc_stage_description.className = "custom-select text-center border-danger";

  var unused_operations_list = get_unused_operations(container);
  set_select_options(qc_stage_description, unused_operations_list);
  qc_stage_description.value = "";
  if(qc_stage_description.value!== "") qc_stage_description.className = "custom-select text-center";


  qc_stage_description.onfocus = function()     //Checks & populates unused option for select container
  {
    empty_container_byReference(qc_stage_description);
    var unused_operations_list = get_unused_operations(container);
    set_select_options(qc_stage_description, unused_operations_list);
    if(qc_stage_description.value!== "") qc_stage_description.className = "custom-select text-center";

  }; 

  let cycle_time = document.createElement("input"); cycle_time.type = "number";
  cycle_time.className = "form-control col-sm-12 mt-1 input-lg text-center";
  cycle_time.placeholder ="Operation Cycle Time (minutes)";
  cycle_time.min = 0;
  cycle_time.max = 24*60;

  cardHeader.appendChild(title);
  cardHeader.appendChild(qc_stage_description);
  cardHeader.appendChild(cycle_time);



  let CardBody = document.createElement('div');
  CardBody.className = 'card-body text-center';
  CardBody.id = "qc_step_body"+index;



  let ButtonRow = document.createElement('div');
  ButtonRow.className = "row text-center mt-3";


  let add_parameter_btn = document.createElement('a');
  add_parameter_btn.className = "col btn btn-outline-dark text-dark";
  add_parameter_btn.innerText = "+ Parameter";
  add_parameter_btn.addEventListener("click",function(){add_parameter_qc_stage(CardBody.id);}, false);

  let remove_parameter_btn = document.createElement('a');
  remove_parameter_btn.className = "col btn btn-outline-dark text-dark";
  remove_parameter_btn.innerText = "- Parameter";
  remove_parameter_btn.addEventListener("click",function(){remove_parameter_qc_stage(CardBody.id);}, false);

  ButtonRow.appendChild(add_parameter_btn);
  ButtonRow.appendChild(remove_parameter_btn);
  cardHeader.appendChild(ButtonRow);

  card.appendChild(cardHeader);
  card.appendChild(CardBody);
  //card.appendChild(CardFooter);

  container.appendChild(card);
  return card;
}
}


//Function to dynamically remove stages in a qc plan
function remove_qc_stage()
{
  var container = document.getElementById("create_qc_plan_dynamic");
//  var index = container.childElementCount;
  container.removeChild(container.lastChild);
}      


//Function to create parameter input boxes
function render_parameter_input_box(param_group_container , param_type)
{

while (param_group_container.childElementCount>12)
param_group_container.removeChild(param_group_container.lastChild);

var parameter_value1, parameter_value2, parameter_hint, line;

if (param_type == data_types[0])
{
      parameter_value1 = document.createElement("input"); parameter_value1.type = "text";
      parameter_value1.className = "form-control col input-lg text-center";
      parameter_value1.placeholder ="Min Value";
      parameter_value1.maxLength = param_value_max_length; 

      parameter_value2 = document.createElement("input"); parameter_value2.type = "text";      
      parameter_value2.className = "form-control col-sm-6 input-lg text-center";
      parameter_value2.placeholder ="Max Value";
      parameter_value2.maxLength = param_value_max_length; 


      parameter_hint = document.createElement("p");
      parameter_hint.innerText = "Enter minimum and maximum acceptable numeric values of parameter. Leave blank if no limit.";
      parameter_hint.className = "col-sm-12 text-primary text-wrap";

      line = document.createElement('hr');
      line.className = "col-sm-12"; 
}

if (param_type == data_types[1])
{
      parameter_value1 = document.createElement("input"); parameter_value1.type = "text";
      parameter_value1.className = "form-control col input-lg text-center";
      parameter_value1.placeholder ="Ok 1,Ok 2,Ok 3";
      parameter_value1.maxLength = param_value_max_length; 

      parameter_value2 = document.createElement("input"); parameter_value2.type = "text";      
      parameter_value2.className = "form-control col-sm-6 input-lg text-center";
      parameter_value2.placeholder ="Not Ok 1,Not Ok 2";
      parameter_value2.maxLength = param_value_max_length;  


      parameter_hint = document.createElement("p");
      parameter_hint.innerText = "Enter acceptable options list in Field 1 and unacceptable options list in Field 2. Separate options with a comma.";
      parameter_hint.className = "col-sm-12 mb-2 text-primary text-wrap";

      line = document.createElement('hr');
      line.className = "col-sm-12"; 

}

else if (param_type == data_types[2])
{
      parameter_value1 = document.createElement("select");
      parameter_value1.className = "custom-select text-center";
      set_select_options(parameter_value1, gl_model_list);

      parameter_value2 = document.createElement("input"); parameter_value2.type = "text";      
      parameter_value2.className = "form-control col-sm-6 input-lg text-center";
      parameter_value2.maxLength = 0;
      parameter_value2.style.display = "none";  

      parameter_hint = document.createElement("p");
      parameter_hint.className = "col-sm-12 text-primary text-wrap";
      parameter_hint.innerText = "Select a Job Type. This input allows linking of child / sub jobs of selected Job Type.";

      line = document.createElement('hr');
      line.className = "col-sm-12"; 

}
else if (param_type == data_types[3])
{
      parameter_value1 = document.createElement("input"); parameter_value1.type = "text";
      parameter_value1.className = "form-control col input-lg text-center";
      parameter_value1.placeholder ="Free Response";
      parameter_value1.maxLength = param_value_max_length; 
      parameter_value1.readOnly = true;

      parameter_value2 = document.createElement("input"); parameter_value2.type = "text";      
      parameter_value2.className = "form-control col-sm-6 input-lg text-center";
      parameter_value2.maxLength = 0;
      parameter_value2.style.display = "none";  


      parameter_hint = document.createElement("p");
      parameter_hint.innerText = "Free response allows a user to enter any value (max 50 characters). Input value is not checked/validated.";
      parameter_hint.className = "col-sm-12 mb-2 text-primary text-wrap";

      line = document.createElement('hr');
      line.className = "col-sm-12"; 
}

  param_group_container.appendChild(parameter_value1);
  param_group_container.appendChild(parameter_value2);
  param_group_container.appendChild(parameter_hint);
  param_group_container.appendChild(line);


}      



//Function to dynamically add parameters in a qc plan stage
function add_parameter_qc_stage(container_id)
{
  var container = document.getElementById(container_id);

  var index = container.childElementCount;

  if (index+1 > max_qc_stage_parameters) {display_error("Max " + max_qc_stage_parameters + " parameters allowed")}
  else
      {
      var parameter_group = document.createElement('div');
      parameter_group.className = "form-row justify-content-center";

      var parameter_name_desc = document.createElement("p");
      parameter_name_desc.className = "col-sm-6 mb-2 text-dark";
      parameter_name_desc.innerText = "Parameter Name";

      var parameter_name = document.createElement("input"); parameter_name.type = "text";
      parameter_name.className = "form-control mb-2 col-sm-6 input-lg text-center";
      parameter_name.placeholder ="Parameter Name";
      parameter_name.maxLength= param_name_max_length; 



      var parameter_criticality_desc = document.createElement("p");
      parameter_criticality_desc.className = "col-sm-6 mb-2 text-dark";
      parameter_criticality_desc.innerText = "Parameter Criticality";

      var parameter_criticality = document.createElement("select");
      parameter_criticality.className = "custom-select mb-2 text-center col-sm-6";
      set_select_options(parameter_criticality, parameter_criticality_level);

      var parameter_reflink_desc = document.createElement("p");
      parameter_reflink_desc.className = "col-sm-6 mb-2 text-dark";
      parameter_reflink_desc.innerText = "Parameter Reference Link";

      var parameter_reflink = document.createElement("input"); parameter_reflink.type = "text";
      parameter_reflink.className = "form-control mb-2 col-sm-6 input-lg text-center";
      parameter_reflink.placeholder ="https://reference-link.com";
      parameter_reflink.maxLength= url_max_length; 

      var parameter_measurement_method_desc = document.createElement("p");
      parameter_measurement_method_desc.className = "col-sm-6 mb-2 text-dark";
      parameter_measurement_method_desc.innerText = "Measurement Method";

      var parameter_measurement_method = document.createElement("input"); parameter_measurement_method.type = "text";
      parameter_measurement_method.className = "form-control mb-2 col-sm-6 input-lg text-center";
      parameter_measurement_method.placeholder ="Measurement Method";
      parameter_measurement_method.maxLength= param_name_max_length; 

      var parameter_measurement_frequency_desc = document.createElement("p");
      parameter_measurement_frequency_desc.className = "col-sm-6 mb-2 text-dark";
      parameter_measurement_frequency_desc.innerText = "Measurement Frequency";

      var parameter_measurement_frequency = document.createElement("input"); parameter_measurement_frequency.type = "number";
      parameter_measurement_frequency.className = "form-control mb-2 col-sm-6 input-lg text-center";
      parameter_measurement_frequency.placeholder ="Measurement Frequency";
      parameter_measurement_frequency.min = 1;
      parameter_measurement_frequency.value = 1;
      parameter_measurement_frequency.maxLength= param_name_max_length;       

      var parameter_type_desc = document.createElement("p");
      parameter_type_desc.className = "col-sm-6 mb-2 text-dark";
      parameter_type_desc.innerText = "Parameter Type";      

      var parameter_type = document.createElement("select");
      parameter_type.className = "custom-select mb-2 col-sm-6 text-center";

      var option1 = document.createElement("option");
      option1.innerText = data_types[0];

      var option2 = document.createElement("option");
      option2.innerText = data_types[1];

      var option3 = document.createElement("option");
      option3.innerText = data_types[2];

      var option4 = document.createElement("option");
      option4.innerText = data_types[3];

      parameter_type.appendChild(option1);
      parameter_type.appendChild(option2);
      parameter_type.appendChild(option3);
      parameter_type.appendChild(option4);

      parameter_group.appendChild(parameter_name_desc);
      parameter_group.appendChild(parameter_name);

      parameter_group.appendChild(parameter_criticality_desc);
      parameter_group.appendChild(parameter_criticality);

      parameter_group.appendChild(parameter_reflink_desc);
      parameter_group.appendChild(parameter_reflink);

      parameter_group.appendChild(parameter_measurement_method_desc);
      parameter_group.appendChild(parameter_measurement_method);      
      
      parameter_group.appendChild(parameter_measurement_frequency_desc);
      parameter_group.appendChild(parameter_measurement_frequency);    

      parameter_group.appendChild(parameter_type_desc);
      parameter_group.appendChild(parameter_type);


      render_parameter_input_box(parameter_group, parameter_type.value);    //create input fields as per param_type

      parameter_type.addEventListener("change",function(){render_parameter_input_box(parameter_group, parameter_type.value);}, false);
      container.appendChild(parameter_group);
      return parameter_group;
    }
} 


//Function to dynamically remove parameters in a qc plan stage
function remove_parameter_qc_stage(container_id)
{
var container = document.getElementById(container_id);
container.removeChild(container.lastChild);
}        


//Function to populate existing process plan
async function populate_process(process_plan)
{
if(is_null(process_plan)) return false;                       // return if process plan empty
var operation_list = Object.keys(process_plan);

for (var i=0; i<operation_list.length; i++)                                   // iterate through stages (keys) of proces_plan 
{
var stage_card = await add_qc_stage();                     // create new stage card
if(is_null(stage_card)) return false;                // Max stage limit reached

stage_card.childNodes[0].childNodes[1].dispatchEvent(new Event('focus', { 'bubbles': true }));    // trigger onfocus event for operation name select contatiner
stage_card.childNodes[0].childNodes[1].value = operation_list[i];  // stage container - card -> 0 : card header -> 1 : operation name select contatiner
stage_card.childNodes[0].childNodes[2].value = process_plan[operation_list[i]].cycle_time || "";    // 2 : Operation Cycle Time


for (var j=0; j<process_plan[operation_list[i]].param_list.length; j++)
{
var param_list = process_plan[operation_list[i]].param_list[j];
var param_container = await add_parameter_qc_stage(stage_card.childNodes[1].id);
if(is_null(param_container))return false;                 // Max param limit reached

// 0 -(parameter_name_desc)  1 - (parameter_name)  2- (parameter_criticality_desc)  3 - (parameter_criticality)
// 4 - (parameter_reflink_desc)  5 - (parameter_reflink)  6 - (parameter_measurement_method_desc)  7 - (parameter_measurement_method)
// 8 - (parameter_type_desc)  9 - (parameter_type)  10 - (parameter_value1)  11 - (parameter_value2)  12 - (parameter_hint)
// 13 - (line)

// param_list ->  {name:"Param1", type:"Numeric Range", level:"Minor", value1:10, value2:12, link: "https://web.com", method: "Visual" },

param_container.childNodes[1].value = param_list.name || "";
param_container.childNodes[3].value = param_list.level || "";
param_container.childNodes[5].value = param_list.link || "";
param_container.childNodes[7].value = param_list.method || "";
param_container.childNodes[9].value = param_list.freq || 1;


param_container.childNodes[11].value = param_list.type;
param_container.childNodes[11].dispatchEvent(new Event('change', { 'bubbles': true }));        // set param type & trigger onchange function to render inputs


param_container.childNodes[12].value = param_list.value1;
param_container.childNodes[13].value = param_list.value2;



}

}
return true;
}



//Function to render screen for creating / updating QC Plan for a model
// mode = 1 indicates called again after copying template from existing process plan
async function create_qc_plan_screen(model_input_field_id, mode = 0)
{
var model_id = document.getElementById(model_input_field_id).value;

if(!validate_input(model_id)) return false;   //displays error if field empty

// Check if existing process plan exists & populate it if so
gl_curr_process_plan = await read_qc_plan(model_id);

// if empty process plan, prompt user to copy template from existing process plan
if(is_null(gl_curr_process_plan))
{
  await display_process_plan_template_selection_modal(model_id, gl_model_list);
}
populate_process(gl_curr_process_plan);

if( is_null(gl_current_operations_list) )
gl_current_operations_list = await read_production_operations_list();

var header = document.getElementById("qc_plan_create_header");
header.model_id = model_id;
header.innerText = "Process Plan for " + header.model_id;

document.getElementById("navigation_model_qc_plans_2").style.display = "block";
document.getElementById("navigation_model_qc_plans_1").style.display = "none";

// function to save process plan on button click
save_qc_plan_btn.onclick=function()
{ create_qc_process_object("create_qc_plan_dynamic", "qc_plan_create_header"); }

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                     Configure Maintenance Plan Section                                             //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//Function to initialize maintenance plan setup section
async function initialize_configure_maintenance_plan_section()
{

  await reset_sections();
  gl_curr_maintenance_plan = {};
  // error if user is not authorised to configure production operations
  if(gl_user_permission.admin != 1 && gl_user_permission.sp_system_settings != 1) 
  {
  display_error("You do not have sufficient permissions for this operation.");
  return false;
  }

  document.getElementById("navigation_configure_maintenance_schedule_1").style.display = "flex";
  document.getElementById("navigation_configure_maintenance_schedule_2").style.display = "none";


  if( is_null(gl_current_operations_list) )
  gl_current_operations_list = await read_production_operations_list();
  
  var workstation_select_list = get_workstation_names_from_operations_obj(gl_current_operations_list);

  let maintenance_plan_select_container = document.getElementById("select_workstation_id_maintenance_section");
  await empty_container_byReference(maintenance_plan_select_container);
  await set_select_options (maintenance_plan_select_container, workstation_select_list);

  create_maintenance_plan_btn.onclick = async function(){await await_loading(create_maintenance_plan_screen, maintenance_plan_select_container.value); }


}

//Support Function to get workstation names list from operations object
function get_workstation_names_from_operations_obj(operations_list)
{  
  var operation_names_list = Object.keys(operations_list);
  var workstation_names_list = [];

  for(var i=0; i<operation_names_list.length; i++)
  {
    var workstation_names = operations_list[operation_names_list[i]];

    for(var j=0; j<workstation_names.length; j++ )
    {
      workstation_names_list.push(workstation_names[j] + " (" + operation_names_list[i] + ")" );
    }
  };

  return workstation_names_list;

}

//Function to create maintenance parameter input boxes
function render_maintenance_parameter_input_box(param_group_container , param_type)
{

while (param_group_container.childElementCount>6)
param_group_container.removeChild(param_group_container.lastChild);

var parameter_value1, parameter_value2, parameter_hint, line;

if (param_type == data_types[0])
{
      parameter_value1 = document.createElement("input"); parameter_value1.type = "number";
      parameter_value1.className = "form-control col input-lg text-center";
      parameter_value1.placeholder ="Min Value";
      parameter_value1.maxLength = param_value_max_length; 

      parameter_value2 = document.createElement("input"); parameter_value2.type = "number";      
      parameter_value2.className = "form-control col-sm-6 input-lg text-center";
      parameter_value2.placeholder ="Max Value";
      parameter_value2.maxLength = param_value_max_length; 


      parameter_hint = document.createElement("p");
      parameter_hint.innerText = "Enter minimum and maximum acceptable numeric values of parameter. Leave blank if no limit.";
      parameter_hint.className = "col-sm-12 text-primary text-wrap";

      line = document.createElement('hr');
      line.className = "col-sm-12"; 
}

else if (param_type == data_types[1])
{
      parameter_value1 = document.createElement("input"); parameter_value1.type = "text";
      parameter_value1.className = "form-control col input-lg text-center";
      parameter_value1.placeholder ="Ok 1,Ok 2,Ok 3";
      parameter_value1.maxLength = param_value_max_length; 

      parameter_value2 = document.createElement("input"); parameter_value2.type = "text";      
      parameter_value2.className = "form-control col-sm-6 input-lg text-center";
      parameter_value2.placeholder ="Not Ok 1,Not Ok 2";
      parameter_value2.maxLength = param_value_max_length;  


      parameter_hint = document.createElement("p");
      parameter_hint.innerText = "Enter acceptable options list in Field 1 and unacceptable options list in Field 2. Separate options with a comma.";
      parameter_hint.className = "col-sm-12 mb-2 text-primary text-wrap";

      line = document.createElement('hr');
      line.className = "col-sm-12"; 

}

else if (param_type == data_types[2])
{
      parameter_value1 = document.createElement("select");
      parameter_value1.className = "custom-select text-center";
      set_select_options(parameter_value1, gl_model_list);

      parameter_value2 = document.createElement("input"); parameter_value2.type = "text";      
      parameter_value2.className = "form-control col-sm-6 input-lg text-center";
      parameter_value2.maxLength = 0;
      parameter_value2.style.display = "none";  

      parameter_hint = document.createElement("p");
      parameter_hint.className = "col-sm-12 text-primary text-wrap";
      parameter_hint.innerText = "Select a Job Type. This input allows linking of child / sub jobs of selected Job Type.";

      line = document.createElement('hr');
      line.className = "col-sm-12"; 

}
else if (param_type == data_types[3])
{
      parameter_value1 = document.createElement("input"); parameter_value1.type = "text";
      parameter_value1.className = "form-control col input-lg text-center";
      parameter_value1.placeholder ="Free Response";
      parameter_value1.maxLength = param_value_max_length; 
      parameter_value1.readOnly = true;

      parameter_value2 = document.createElement("input"); parameter_value2.type = "text";      
      parameter_value2.className = "form-control col-sm-6 input-lg text-center";
      parameter_value2.maxLength = 0;
      parameter_value2.style.display = "none";  


      parameter_hint = document.createElement("p");
      parameter_hint.innerText = "Free response allows a user to enter any value (max 50 characters). Input value is not checked/validated.";
      parameter_hint.className = "col-sm-12 mb-2 text-primary text-wrap";

      line = document.createElement('hr');
      line.className = "col-sm-12"; 
}

  param_group_container.appendChild(parameter_value1);
  param_group_container.appendChild(parameter_value2);
  param_group_container.appendChild(parameter_hint);
  param_group_container.appendChild(line);


}  


//Function to dynamically add parameters in a maintenance plan stage
function add_parameter_maintenance_stage(container_id, param_stage_value={})
{
  var container = document.getElementById(container_id);

  var index = container.childElementCount;

  if (index+1 > max_maintenance_stage_parameters) {display_error("Max " + max_maintenance_stage_parameters + " parameters allowed")}
  else
      {
      var parameter_group = document.createElement('div');
      parameter_group.className = "form-row justify-content-center";

      var parameter_name_desc = document.createElement("p");
      parameter_name_desc.className = "col-sm-6 mb-2 text-dark";
      parameter_name_desc.innerText = "Parameter Name";

      var parameter_name = document.createElement("input"); parameter_name.type = "text";
      parameter_name.className = "form-control mb-2 col-sm-6 input-lg text-center";
      parameter_name.placeholder ="Parameter Name";
      parameter_name.maxLength= param_name_max_length; 


      var parameter_reflink_desc = document.createElement("p");
      parameter_reflink_desc.className = "col-sm-6 mb-2 text-dark";
      parameter_reflink_desc.innerText = "Parameter Reference Link";

      var parameter_reflink = document.createElement("input"); parameter_reflink.type = "text";
      parameter_reflink.className = "form-control mb-2 col-sm-6 input-lg text-center";
      parameter_reflink.placeholder ="https://reference-link.com";
      parameter_reflink.maxLength= url_max_length; 

      var parameter_type_desc = document.createElement("p");
      parameter_type_desc.className = "col-sm-6 mb-2 text-dark";
      parameter_type_desc.innerText = "Parameter Type";      

      var parameter_type = document.createElement("select");
      parameter_type.className = "custom-select mb-2 col-sm-6 text-center";

      var option1 = document.createElement("option");
      option1.innerText = data_types[0];

      var option2 = document.createElement("option");
      option2.innerText = data_types[1];

//      var option3 = document.createElement("option");   // no sub job type for maintenance parameters
//      option3.innerText = data_types[2];

      var option4 = document.createElement("option");
      option4.innerText = data_types[3];

      parameter_type.appendChild(option1);
      parameter_type.appendChild(option2);
//      parameter_type.appendChild(option3);
      parameter_type.appendChild(option4);

      parameter_group.appendChild(parameter_name_desc);
      parameter_group.appendChild(parameter_name);

      parameter_group.appendChild(parameter_reflink_desc);
      parameter_group.appendChild(parameter_reflink);

      parameter_group.appendChild(parameter_type_desc);
      parameter_group.appendChild(parameter_type);

      parameter_type.value = param_stage_value.type || data_types[0];
      render_parameter_input_box(parameter_group, parameter_type.value);    //create input fields as per param_type

      parameter_type.addEventListener("change",function(){render_maintenance_parameter_input_box(parameter_group, parameter_type.value);}, false);
      container.appendChild(parameter_group);

      // Add parameter values if present
      if(!is_null(param_stage_value))
      {
        parameter_name.value = param_stage_value.name;
        parameter_reflink.value = param_stage_value.link;
        parameter_group.childNodes[6].value = param_stage_value.value1;
        parameter_group.childNodes[7].value = param_stage_value.value2;        
      }

      return parameter_group;
    }
} 


//Function to dynamically remove parameters in a maintenance plan stage
function remove_parameter_maintenance_stage(container_id)
{
var container = document.getElementById(container_id);
container.removeChild(container.lastChild);
}        

//Function to populate existing process plan
async function populate_maintenance_plan(maintenance_plan)
{
  var maintenance_plan_container = document.getElementById("create_maintenance_plan_dynamic");
  empty_container_byReference(maintenance_plan_container);

  let card = document.createElement('div');
  card.className = 'col-sm-4 card shadow cursor-pointer mb-2 justify-content-center text-center';
  card.id = "maintenance_plan_card";
  
  let cardHeader = document.createElement('div');
  cardHeader.className = 'card-header';

  let title = document.createElement('h6');
  title.innerText = "Periodic Maintenance Interval (Days)";
  title.className = 'card-title text-break';


  let cycle_time = document.createElement("input"); cycle_time.type = "number";
  cycle_time.className = "form-control col-sm-12 mt-1 input-lg text-center";
  cycle_time.defaultValue = maintenance_plan.cycle_time || 1;
  cycle_time.min = 1;

  cardHeader.appendChild(title);
  cardHeader.appendChild(cycle_time);

  let ButtonRow = document.createElement('div');
  ButtonRow.className = "row text-center mt-3";


  let add_parameter_btn = document.createElement('a');
  add_parameter_btn.className = "col btn btn-outline-dark text-dark";
  add_parameter_btn.innerText = "+ Parameter";
  add_parameter_btn.addEventListener("click",function(){add_parameter_maintenance_stage(CardBody.id);}, false);

  let remove_parameter_btn = document.createElement('a');
  remove_parameter_btn.className = "col btn btn-outline-dark text-dark";
  remove_parameter_btn.innerText = "- Parameter";
  remove_parameter_btn.addEventListener("click",function(){remove_parameter_maintenance_stage(CardBody.id);}, false);

  ButtonRow.appendChild(add_parameter_btn);
  ButtonRow.appendChild(remove_parameter_btn);
  cardHeader.appendChild(ButtonRow);

  let CardBody = document.createElement('div');
  CardBody.className = 'card-body text-center';
  CardBody.id = "maintenance_plan_card_body";

  card.appendChild(cardHeader);
  card.appendChild(CardBody);

  maintenance_plan_container.appendChild(card);

  // Populate parameters if plan present
  if(!is_null(maintenance_plan))
  {
    var params = maintenance_plan.param_list;

    for(var i=0; i<params.length; i++)
    {
      add_parameter_maintenance_stage(CardBody.id, params[i]);
    }
  }

  return true;
}

//Function to render screen for creating / updating Maintenance Plan for a workstation
async function create_maintenance_plan_screen(workstation_id)
{
if(!validate_input(workstation_id)) return false;   //displays error if field empty

// Check if existing workstation plan exists & populate it if so
if(is_null(gl_curr_maintenance_plan) || gl_curr_maintenance_plan["workstation"] != workstation_id)

gl_curr_maintenance_plan = await read_maintenance_plan(workstation_id);
await populate_maintenance_plan(gl_curr_maintenance_plan);

var header = document.getElementById("maintenance_plan_create_header");
header.workstation_id = workstation_id;
header.innerText = "Maintenance Plan Setup for " + header.workstation_id;

document.getElementById("navigation_configure_maintenance_schedule_1").style.display = "none";
document.getElementById("navigation_configure_maintenance_schedule_2").style.display = "block";


// function to save workstation maintenance plan on button click
save_maintenance_plan_btn.onclick=async function()
{ await await_loading(create_maintenance_plan_object,"create_maintenance_plan_dynamic", "maintenance_plan_create_header"); }

delete_maintenance_plan_btn.onclick=async function()
{ await display_confirmation("Are you sure you want to delete Maintenance Plan for " + workstation_id + " ?", await_loading, delete_maintenance_plan,[workstation_id]); }

}




////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                           Configure Production Operations                                          //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//Function to initialize configure production operations section
async function initialize_production_operation_section()
{
  await reset_sections();
// error if user is not authorised to configure production operations
if(gl_user_permission.admin != 1 && gl_user_permission.sp_system_settings != 1) 
{
display_error("You do not have sufficient permissions for this operation.");
return false;
}

if( is_null(gl_current_operations_list) )
gl_current_operations_list = await read_production_operations_list();

var operation_name_list = Object.keys(gl_current_operations_list)

var container = document.getElementById("production_operation_list_dynamic");

for (var i=0;i<operation_name_list.length;i++)
{
let card = document.createElement('div');
  card.className = 'col-sm-4 card cursor-pointer mb-2 justify-content-center text-center';

  // Add operation names
  let cardHeader = document.createElement('div');
  cardHeader.className = 'card-header';

  let title = document.createElement('h5');
  title.innerText = "Operation Details";
  title.className = 'card-title';

  let production_operation_description = document.createElement("input"); 
  production_operation_description.type = "text"; 
  production_operation_description.maxLength = param_name_max_length;
  production_operation_description.className = "form-control col input-lg text-center text-primary bg-white";
  production_operation_description.placeholder = "Operation Description";
  production_operation_description.value = operation_name_list[i];

  cardHeader.appendChild(title);
  cardHeader.appendChild(production_operation_description);

  let ButtonRow = document.createElement('div');
  ButtonRow.className = "row text-center mt-3";

  let add_workstation_btn = document.createElement('a');
  add_workstation_btn.className = "col btn btn-outline-dark text-dark";
  add_workstation_btn.innerText = "+ Workstation";
  add_workstation_btn.onclick = function(){add_workstation(CardBody.id);}

  let remove_workstation_btn = document.createElement('a');
  remove_workstation_btn.className = "col btn btn-outline-dark text-dark";
  remove_workstation_btn.innerText = "- Workstation";
  remove_workstation_btn.onclick = function(){remove_workstation(CardBody.id);}

  ButtonRow.appendChild(add_workstation_btn);
  ButtonRow.appendChild(remove_workstation_btn);
  cardHeader.appendChild(ButtonRow);


  // Add Workstation names
  let CardBody = document.createElement('div');
  CardBody.className = 'card-body text-center';
  CardBody.id = "operation_body"+i;

  var workstation_name_list = gl_current_operations_list[operation_name_list[i]];


  card.appendChild(cardHeader);
  card.appendChild(CardBody);

  container.appendChild(card);

  for(var j=0; j < workstation_name_list.length; j++ )
  add_workstation(CardBody.id, workstation_name_list[j])
 
}

}


//Function to dynamically add stages in configure production operations section
function add_production_operation_stage()
{
var container = document.getElementById("production_operation_list_dynamic");
var index = container.childElementCount;

if (index+1 > max_production_operations ) {display_error("Max limit reached. Only " +  max_production_operations + " Operations allowed.")}
else{
  let card = document.createElement('div');
  card.className = 'col-sm-4 card cursor-pointer mb-2 justify-content-center text-center';

  // Operation title
  let cardHeader = document.createElement('div');
  cardHeader.className = 'card-header';

  let title = document.createElement('h5');
  title.innerText = "Operation Details";
  title.className = 'card-title';

  let production_operation_description = document.createElement("input"); 
  production_operation_description.type = "text"; 
  production_operation_description.maxLength = param_name_max_length;
  production_operation_description.className = "form-control col input-lg text-center text-primary";
  production_operation_description.placeholder = "Enter Operation Name";

  cardHeader.appendChild(title);
  cardHeader.appendChild(production_operation_description);

  // Add or remove workstation buttons
  let ButtonRow = document.createElement('div');
  ButtonRow.className = "row text-center mt-3";


  let add_workstation_btn = document.createElement('a');
  add_workstation_btn.className = "col btn btn-outline-dark text-dark";
  add_workstation_btn.innerText = "+ Workstation";
  add_workstation_btn.onclick = function(){add_workstation(CardBody.id);}

  let remove_workstation_btn = document.createElement('a');
  remove_workstation_btn.className = "col btn btn-outline-dark text-dark";
  remove_workstation_btn.innerText = "- Workstation";
  remove_workstation_btn.onclick = function(){remove_workstation(CardBody.id);}

  ButtonRow.appendChild(add_workstation_btn);
  ButtonRow.appendChild(remove_workstation_btn);
  cardHeader.appendChild(ButtonRow);

  // Workstation names
  let CardBody = document.createElement('div');
  CardBody.className = 'card-body text-center';
  CardBody.id = "operation_body"+index;


  card.appendChild(cardHeader);
  card.appendChild(CardBody);

  container.appendChild(card);

  // add empty workstation
  add_workstation(CardBody.id);
}
}


//Function to dynamically remove stages in a qc plan
function remove_production_operation_stage()
{
  var container = document.getElementById("production_operation_list_dynamic");
  container.removeChild(container.lastChild);
} 


//Function to dynamically add workstations in a production operations section
function add_workstation(container_id, workstation_name_value = "")
{
  var container = document.getElementById(container_id);

  var index = container.childElementCount;

  if (index+1 > max_workstations_per_operation) {display_error("Max " + max_workstations_per_operation + " workstations allowed per operation")}
  else
      {
      var workstation_group = document.createElement('div');
      workstation_group.className = "form-row justify-content-center";

      var workstation_name = document.createElement("input"); 
      workstation_name.type = "text";
      workstation_name.className = "form-control mb-3 col input-lg text-center";
      workstation_name.placeholder ="Enter Workstation Name / ID";
      workstation_name.maxLength= param_name_max_length; 

      if(workstation_name_value != "")
      workstation_name.value = workstation_name_value;

      workstation_group.appendChild(workstation_name);

      container.appendChild(workstation_group);
      return workstation_group;
    }
} 


//Function to dynamically remove workstation in a production operations section 
function remove_workstation(container_id)
{
var container = document.getElementById(container_id);
container.removeChild(container.lastChild);
}  


//Function to clear unsaved data in configure production operations section list
async function clear_unsaved_operations()
{
if( is_null(gl_current_operations_list) )
gl_current_operations_list = await read_production_operations_list();

var container = document.getElementById("production_operation_list_dynamic");
while (container.childElementCount > Object.keys(gl_current_operations_list).length)
{container.removeChild(container.lastChild);}
}




////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                     Configure User Permission Section                                              //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////


// Function to initialize User Configuration section
async function initialize_user_permission_section(reload=false)
{
reset_sections();

// error if user is not authorised to set user permissions
if(gl_user_permission.admin != 1 && gl_user_permission[section_permission_list["Configure Users"]] != 1) 
{
display_error("You do not have sufficient permissions for this operation.");
return false;
}

document.getElementById("navigation_user_permission_2").style.display = "none";
document.getElementById("navigation_user_permission_1").style.display = "flex";

let email_select_container = document.getElementById("select_email_user_permission_section");
let email_container = document.getElementById("email_user_permission_section");
let password_container = document.getElementById("password_user_permission_section");

email_container.value = "";
password_container.value = "";

empty_container_byReference(email_select_container);

if ((gl_user_list.length == 0 || is_null(gl_user_list) ) && reload == false)        // read user permission if empty
gl_user_list = await read_user_list();

set_select_options(email_select_container, gl_user_list.sort() );

/*        email_select_container.value = "";  email_container.value = "";
email_select_container.onchange = function(){ email_container.value = email_select_container.value; };
email_container.onchange = function(){email_select_container.value = ""; };
*/
}


// Function to render permission parameters inputs
async function render_permission_inputs(section_permission_container, alert_notification_container, basic_info_permission_container, operation_permission_container, user_permission_obj)
{
empty_container_byReference (section_permission_container);     // empty containers with permissions from previous run
empty_container_byReference (alert_notification_container);
empty_container_byReference (basic_info_permission_container);
empty_container_byReference (operation_permission_container);

var section_list = Object.keys(section_permission_list);                                 
if( is_null(gl_current_operations_list))
gl_current_operations_list = await read_production_operations_list();

for (var i=0; i<section_list.length; i++ )                                // Permission to display & access various section
{
var permission_group = document.createElement('div');
permission_group.className = "form-row justify-content-center";


var permission_desc = document.createElement("p");
permission_desc.className = "col mb-2 text-primary";
permission_desc.innerText = section_list[i];

var permission_value = document.createElement("select");
permission_value.className = "custom-select mb-2 text-center col-sm-6";
set_select_options(permission_value, permission_list_no_yes);

var section_key = section_permission_list[section_list[i]];      // Read how section permission (key) is saved in user permission object
if( !is_null(user_permission_obj[section_key]) )
permission_value.value = permission_list_no_yes[user_permission_obj[section_key]];
else permission_value.value = permission_list_no_yes[0];

var line = document.createElement('hr');
line.className = "col-sm-12"; 

permission_group.appendChild(permission_desc);
permission_group.appendChild(permission_value);
permission_group.appendChild(line);
section_permission_container.appendChild(permission_group);
}
section_permission_container.appendChild(document.createElement('br'));


for (var i=0; i<1; i++)                                             // Render permission inputs for "Basic Info" section
{
var permission_group = document.createElement('div');
permission_group.className = "form-row justify-content-center";

var operation_name = "Basic Info";
var permission_desc = document.createElement("p");
permission_desc.className = "col mb-2 text-primary";
permission_desc.innerText = operation_name;

var permission_value = document.createElement("select");
permission_value.className = "custom-select mb-2 text-center col-sm-6";
set_select_options(permission_value, permission_list_access.slice(1,4));      // Ignore "None". Only - "Read", "Write", "Update"

if( !is_null(user_permission_obj[operation_name]) )
permission_value.value = permission_list_access[user_permission_obj[operation_name]];       // convert number to text permission
else permission_value.value = permission_list_access[1];

var line = document.createElement('hr');
line.className = "col-sm-12"; 

permission_group.appendChild(permission_desc);
permission_group.appendChild(permission_value);
permission_group.appendChild(line);
basic_info_permission_container.appendChild(permission_group);
}

var operation_name_list = Object.keys(gl_current_operations_list);

for (var i=0; i<operation_name_list.length; i++)             // Render permission inputs for operations access
{
var permission_group = document.createElement('div');
permission_group.className = "form-row justify-content-center";

var operation_name = operation_name_list[i];
var permission_desc = document.createElement("p");
permission_desc.className = "col mb-2 text-primary";
permission_desc.innerText = operation_name;

var permission_value = document.createElement("select");
permission_value.className = "custom-select mb-2 text-center col-sm-6";
set_select_options(permission_value, permission_list_access);

if( !is_null(user_permission_obj[operation_name]) )
permission_value.value = permission_list_access[user_permission_obj[operation_name]];       // convert number to text permission
else permission_value.value = permission_list_access[0];

var line = document.createElement('hr');
line.className = "col-sm-12"; 

permission_group.appendChild(permission_desc);
permission_group.appendChild(permission_value);
permission_group.appendChild(line);
operation_permission_container.appendChild(permission_group);
}

operation_permission_container.appendChild(document.createElement('br'));

for (var i=0; i<operation_name_list.length; i++ )                                // Permission to receive alert notifications for various operations
{
var permission_group = document.createElement('div');
permission_group.className = "form-row justify-content-center";


var permission_desc = document.createElement("p");
permission_desc.className = "col mb-2 text-primary";
permission_desc.innerText = operation_name_list[i];

var permission_value = document.createElement("select");
permission_value.className = "custom-select mb-2 text-center col-sm-6";
set_select_options(permission_value, permission_list_no_yes);

var section_key = operation_name_list[i] + "_an";      // Read how operation alert permission (key) is saved in user permission object
if( !is_null(user_permission_obj[section_key]) )
permission_value.value = permission_list_no_yes[user_permission_obj[section_key]];
else permission_value.value = permission_list_no_yes[0];

var line = document.createElement('hr');
line.className = "col-sm-12"; 

permission_group.appendChild(permission_desc);
permission_group.appendChild(permission_value);
permission_group.appendChild(line);
alert_notification_container.appendChild(permission_group);
}
alert_notification_container.appendChild(document.createElement('br'));


} 


// Function to render screen for creating / updating user permissions
async function create_user_permission_screen(user_email_field_id)
{

var user_email = document.getElementById(user_email_field_id).value;

if(!validate_input(user_email)) return false;   //displays error if field empty

// Check if existing user permission exists & populate it if so
var selected_user_permission = await read_other_user_permsission(user_email);

// if no permissions found, leave empty
if( is_null(selected_user_permission) ) { selected_user_permission = {}; }

var header = document.getElementById("user_permission_create_header");
header.user_email = user_email;
header.innerText = "Set User Permissions for " + header.user_email;


var section_permission_container = document.getElementById("create_user_permission_static");
var alert_notification_container = document.getElementById("create_user_permission_alert");
var basic_info_permission_container = document.getElementById("create_user_permission_basic_info");
var operation_permission_container = document.getElementById("create_user_permission_dynamic");

render_permission_inputs(section_permission_container, alert_notification_container, basic_info_permission_container, operation_permission_container, selected_user_permission);

document.getElementById("navigation_user_permission_2").style.display = "block";
document.getElementById("navigation_user_permission_1").style.display = "none";

save_user_btn.onclick = async function()
{
await create_user_permission_object(section_permission_container, alert_notification_container, basic_info_permission_container, operation_permission_container , "user_permission_create_header", selected_user_permission);
}

delete_user_btn.onclick = async function()
{
await display_confirmation("Are you sure you want to delete this user?", delete_user, "user_permission_create_header");
}

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                     Configure Notifications Section                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

async function initialize_configure_notifications_section()
{
  var notification_list = await read_notification_subscribers_list();

  const low_credit_notification_list = notification_list.low_credit || [];
  const maintenance_notification_list = notification_list.maintenance || [];

  document.getElementById("low_credit_notification_email_1").value = low_credit_notification_list[0] || "";
  document.getElementById("low_credit_notification_email_2").value = low_credit_notification_list[1] || "";
  document.getElementById("low_credit_notification_email_3").value = low_credit_notification_list[2] || "";

  document.getElementById("machine_maintenance_notification_email_1").value = maintenance_notification_list[0] || "";
  document.getElementById("machine_maintenance_notification_email_2").value = maintenance_notification_list[1] || "";
  document.getElementById("machine_maintenance_notification_email_3").value = maintenance_notification_list[2] || "";

  save_configure_notifications_btn.onclick=async function(){ 
                                                        const new_low_credit_notification_list=
                                                        [
                                                          document.getElementById("low_credit_notification_email_1").value,
                                                          document.getElementById("low_credit_notification_email_2").value,
                                                          document.getElementById("low_credit_notification_email_3").value
                                                        ];
                                                        
                                                        const new_maintenance_notification_list=
                                                        [
                                                          document.getElementById("machine_maintenance_notification_email_1").value,
                                                          document.getElementById("machine_maintenance_notification_email_2").value,
                                                          document.getElementById("machine_maintenance_notification_email_3").value
                                                        ];

                                                        await await_loading(write_notification_list,new_low_credit_notification_list,new_maintenance_notification_list);
                                                        return true;
                                                     }

}


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                        Configure View Credits Section                                              //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

//  function to initialize View Credits Section

async function initialize_view_credits_section()
{
  await reset_sections();
  gl_credits_obj = await read_credit_balance();

  let credit_balance_container = document.getElementById("credit_balance")

  // Populate card for credit_balance_container
    let credit_balance_card = document.createElement('div');
    credit_balance_card.className = "card mt-4";

    let credit_balance_card_header = document.createElement('div');
    credit_balance_card_header.className = "card-header";

    let credit_balance_card_body = document.createElement('div'); 
    credit_balance_card_body.className = "card-body";

    let credit_balance_log_title = document.createElement('div');
    credit_balance_log_title.className = "text-dark mt-2";
    credit_balance_log_title.innerHTML = "<h3>Credit Details</h3>";
    credit_balance_card_header.appendChild(credit_balance_log_title);

      //Display Credits Available
      let credits_available_title = document.createElement('div');
      credits_available_title.className = "text-dark mt-4 mb-4";
      credits_available_title.innerHTML = "<h5>Available Credits</h5>";

      let credits_available = document.createElement('div');
      credits_available.className = "text-primary mt-4 mb-4";
      credits_available.innerHTML = "<h5>"+gl_credits_obj.val+"</h5>";

      
      let line_space_1 = document.createElement('hr');

      let credits_daily_usage_title = document.createElement('div');
      credits_daily_usage_title.className = "text-dark mt-4";
      credits_daily_usage_title.innerHTML = "<h5>Average Usage</h5>";

      let credits_daily_usage = document.createElement('div');
      credits_daily_usage.className = "text-primary mt-4 mb-4";
      credits_daily_usage.innerHTML = "<h5>"+Math.ceil(gl_credits_obj.avg_daily_usage)+" credits/day</h5>";

      let line_space_2 = document.createElement('hr');

      const validity_date = decode_date(gl_credits_obj.validity,1);

      let credits_subscription_validity_title = document.createElement('div');
      credits_subscription_validity_title.className = "text-dark mt-4";
      credits_subscription_validity_title.innerHTML = "<h5>Subscription Expiry Date</h5>";

      let credits_subscription_validity = document.createElement('div');
      credits_subscription_validity.className = "mt-4 mb-4";
      
      if(validity_date < new Date) credits_subscription_validity.className += " text-danger"
      else credits_subscription_validity.className += " text-primary";

      credits_subscription_validity.innerHTML = "<h5>"+ decode_date(gl_credits_obj.validity,1).toDateString()+"</h5>";

      let line_space_3 = document.createElement('hr');      


      let credit_purchase_btn = document.createElement('div');
      credit_purchase_btn.className = "btn btn-primary btn-block mt-4";
      credit_purchase_btn.innerText = "Buy more credits";      

      let credit_usage_statement_btn = document.createElement('div');
      credit_usage_statement_btn.className = "btn btn-primary btn-block mt-4";
      credit_usage_statement_btn.innerText = "Download Usage Statement";           

      credit_balance_card_body.appendChild(credits_available_title);
      credit_balance_card_body.appendChild(credits_available);
      credit_balance_card_body.appendChild(line_space_1);

      credit_balance_card_body.appendChild(credits_daily_usage_title);
      credit_balance_card_body.appendChild(credits_daily_usage);
      credit_balance_card_body.appendChild(line_space_2);

      credit_balance_card_body.appendChild(credits_subscription_validity_title);
      credit_balance_card_body.appendChild(credits_subscription_validity);
      credit_balance_card_body.appendChild(line_space_3);

      credit_balance_card_body.appendChild(credit_purchase_btn);
      credit_balance_card_body.appendChild(credit_usage_statement_btn);


    credit_balance_card.appendChild(credit_balance_card_header);
    credit_balance_card.appendChild(credit_balance_card_body);

  
  credit_balance_container.appendChild(credit_balance_card);

  // Generate credit usage statement PDF on button clock
  credit_usage_statement_btn.onclick = async function(){await await_loading(generate_credit_usage_report_pdf,gl_credits_obj);}

  return true;
}

// Support function to help sort credit log entries by date
function compare_dates_credit_log_entries(entry_1, entry_2)
{
  return new Date(entry_1.dt) - new Date(entry_2.dt);
}

// Support function to render credit usage pdf report
function render_credit_usage_pdf_report(summary_table_header, summary_table_data, transaction_log_table_header, transaction_log_table_data, date_range)
{
  const pdf_width = 210;          // a4 paper - dimensions in mm
  const pdf_height = 297;
  const starting_height = 10;
  var vertical_pos = starting_height;
  const spacing = 6;
  
  const doc = new jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: [pdf_width, pdf_height] });
  
  // Print document title  
  doc.setTextColor(100);  // gray color
  doc.setFontSize(14);
  doc.text("Qik Process", pdf_width/2, vertical_pos+=spacing, {align:"center"});    

  doc.setTextColor("black");  // gray color
  doc.setFontSize(14);
  doc.text("Credit Usage Statement", pdf_width/2, vertical_pos+=spacing, {align:"center"});    


  // set company name on page top center
  const company_name = gl_curr_user_details.company;
  doc.setTextColor(100);  
  doc.setFontSize(10);
  doc.text("Company Name: "+ company_name, pdf_width/2, vertical_pos+=spacing, {align:"center"});  
  
  doc.setFontSize(10);        // regular font size
  doc.text("Summary " + date_range, pdf_width/2, vertical_pos+=spacing, {align:"center"});  
   
  doc.autoTable({
                  head: summary_table_header,
                  body: summary_table_data,
                  theme : 'grid',
                  styles: { fontSize: 10, valign: 'middle', lineColor : '#000000' },
                  headStyles : {fillColor: '#2F8ECE', textColor: '#ffffff', lineColor : '#000000', lineWidth: 0.1},          // Color of header
                //    columnStyles: { 3: { halign: 'center' } }, // Cells in third column centered and green
                  startY: 38, 
                 });

doc.addPage({ orientation: "portrait", format: [pdf_width, pdf_height] })                 
doc.text("Credit Usage Details", pdf_width/2, vertical_pos=starting_height*2, {align:"center"});  
doc.autoTable({
                  head: transaction_log_table_header,
                  body: transaction_log_table_data,
                  theme : 'grid',
                  styles: { fontSize: 10, valign: 'middle', lineColor : '#000000' },
                  headStyles : {fillColor: '#2F8ECE', textColor: '#ffffff', lineColor : '#000000', lineWidth: 0.1},          // Color of header
                //    columnStyles: { 3: { halign: 'center' } }, // Cells in third column centered and green
                  startY: 25, 
                 });

  
  // Set Page Numbers & other details
  for (var i=1; i<=doc.internal.getNumberOfPages(); i++ )
  {
      doc.setTextColor(100);  // gray color
      doc.setFontSize(10);
      doc.setPage(i);
      doc.text("Page " + i + " of " + doc.internal.getNumberOfPages(), pdf_width-10, 7, {align:'right'});
      doc.text("Powered by Qik Process", pdf_width-10 , pdf_height-5, {align:'right'});
  
    }
  
  doc.save("Credit Usage Report.pdf");
}

// Function to generate PDF report about credit usage details
async function generate_credit_usage_report_pdf(credits_main_info)
{
  if(is_null(credits_main_info))
  return false;

  const start_log_doc = credits_main_info.start_log_doc;
  const current_log_doc =  credits_main_info.current_log_doc;

  var temp_credit_log_container = [];

  for(var i=start_log_doc; i <= current_log_doc; i++)
  {
    const credit_log_doc_ref = db.collection("app").doc(gl_curr_user_details.company_id).collection("credit_logs").doc(i.toString());
    temp_credit_log_container.push(credit_log_doc_ref.get()); 
  }

  temp_credit_log_container = await Promise.all(temp_credit_log_container);


  var cut_off_date = new Date();
  cut_off_date.setHours(0); cut_off_date.setMinutes(0); cut_off_date.setSeconds(0);
  cut_off_date.setDate(1);
  cut_off_date.setMonth(cut_off_date.getMonth()-gl_max_credit_usage_log_months);  

  // var to store all credit usage entries
  var credit_transactions_log = [];

  for(var i=0; i<temp_credit_log_container.length; i++)
  {
    const log_content = temp_credit_log_container[i].data()["log"];

    for(var j=0; j<log_content.length; j++)
    {
      if(log_content[j].dt.toDate() >= cut_off_date )
      {
        log_content[j].dt = log_content[j].dt.toDate();
        credit_transactions_log.push(log_content[j]);
      }
    }

  }

  credit_transactions_log = credit_transactions_log.sort(compare_dates_credit_log_entries);

  var credit_opening_balance = Number(credits_main_info.val);
  for(var i=0; i<credit_transactions_log.length; i++)
  {
    credit_opening_balance-= credit_transactions_log[i].credit_amt;
  }

  const credit_closing_balance = Number(credits_main_info.val);
  var monthly_stats = {};

  // get monthly credit statistics
  for(var i=0; i< credit_transactions_log.length; i++) 
  {
    const entry_date = credit_transactions_log[i].dt;
    const entry_month = new Date(entry_date);

    entry_month.setHours(0,0,0,1);
    entry_month.setDate(1);

    if( is_null(monthly_stats[entry_month]) )
    monthly_stats[entry_month] = {
                                    "credits_purchased" : 0,
                                    "credits_used" : 0
                                 };

    if( credit_transactions_log[i]["credit_amt"] <= 0 )
    monthly_stats[entry_month]["credits_used"] += credit_transactions_log[i]["credit_amt"];
    else 
    monthly_stats[entry_month]["credits_purchased"] += credit_transactions_log[i]["credit_amt"];

  }


  //Prepare data for summary_table

  const summary_table_header = [["Month", "Credits Purchased", "Credits Used", "Credit Balance"]];
  var summary_table_data = [];

  summary_table_data.push(["Opening Balance", " ", " ", credit_opening_balance]);

  const month_nos = Object.keys(monthly_stats);
  month_nos.sort(compare_dates_credit_log_entries);
  var credit_balance = credit_opening_balance;

  for(var i=0; i<month_nos.length; i++)
  {
    var month_name = monthNames[(new Date(month_nos[i])).getMonth()] + " - " + (new Date(month_nos[i])).getFullYear();

//    const current_month_number = (new Date()).getMonth();
//    if(month_nos[i].toString() == current_month_number.toString()) month_name = "Current Month"; 

    const credits_purchased = monthly_stats[month_nos[i]]["credits_purchased"];
    const credits_used = monthly_stats[month_nos[i]]["credits_used"];
    credit_balance += credits_purchased + credits_used;
    summary_table_data.push([month_name, credits_purchased , Math.abs(credits_used) , credit_balance]);

  }
  summary_table_data.push(["Closing Balance", " ", " ", credit_closing_balance]);

  //Prepare data for transaction_log_table

  const transaction_log_table_header = [["S.no.","Date","Remark","Credit Amt","Credit Balance"]];
  var transaction_log_table_data = [];
  var current_tally = credit_opening_balance;

  for(var i=0; i<credit_transactions_log.length; i++)
  {
    current_tally += credit_transactions_log[i].credit_amt;

    const txn_date = await decode_date(credit_transactions_log[i].dt);
    const txn_remark = credit_transactions_log[i].remark;
    var txn_amount = credit_transactions_log[i].credit_amt;
    if(txn_amount > 0 ) txn_amount = "+" + txn_amount.toString();
    const txn_balance = current_tally;

    transaction_log_table_data.push([i+1, txn_date, txn_remark, txn_amount, txn_balance]);

  }

  var date_range = "(" + monthNames[cut_off_date.getMonth()] + "," + cut_off_date.getFullYear() + " - " + monthNames[(new Date()).getMonth()] + "," + (new Date()).getFullYear() + ")";

  render_credit_usage_pdf_report(summary_table_header, summary_table_data, transaction_log_table_header, transaction_log_table_data, date_range);
//  console.log(monthly_stats);

}





////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                                      DATABASE STRUCTURE                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/*
    Credit Docs for Quick Access-
    Credits (Main Summary Details) - db.collection("app").doc(company_id).collection("credit_logs").doc("0")
    Credits (Detail Usage Logs) - db.collection("app").doc(company_id).collection("credit_logs").doc({doc_name}) where {doc_name} is 1, 2, 3, etc

    Global Variables for Quick Access-
    Operations List - db.collection("app").doc(company_id).collection("global").doc("operation_list")
    Model List - db.collection("app").doc(company_id).collection("global").doc("model_list")
    Maintenance List - db.collection("app").doc(company_id).collection("global").doc("maintenance_list")
    User List -  - db.collection("app").doc(company_id).collection("global").doc("user_list")
    Alert Notifcations - db.collection("app").doc(company_id).collection("global").doc("alerts")
    Alert Subscriber List Notifcations - db.collection("app").doc(company_id).collection("global").doc("alert_subscriber_list")

    Collections-
    credit_logs - db.collection("app").doc(company_id).collection("credit_logs") 
    global - db.collection("app").doc(company_id).collection("global")
    records - db.collection("app").doc(company_id).collection("records")
    maintenance_records - db.collection("app").doc(company_id).collection("maintenance_record")
    disruptions - db.collection("app").doc(company_id).collection("disruptions")    
    process plan models - db.collection("app").doc(company_id).collection("process_plan")
    maintenance plans - db.collection("app").doc(company_id).collection("maintenance_plan")
    users - db.collection("app").doc(company_id).collection("users")

    Example   
    /app/Company 1/users/u1@gmail.com
    db.collection("app").doc(company_id).collection("users").doc(user_email).update


*/




////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                             Functions to Validate Encoded Data Before Writing to Database                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// 
//Function Validate QC Process Object
function validate_qc_process_object (qc_object, model)             //return true if ok, else return false & display error message
{
// check if model name is blank or undefined
if(model == "" || model == undefined ) {display_error("Data Corrupted. Please refresh and try again."); return false;}

var operations = Object.keys(qc_object);

var operation_name_list = Object.keys(gl_current_operations_list);

//check if no steps / stages are added to qc process
if (operations.length <1)  {display_error("Please add some process steps before saving."); return false;}

//check if operation titles exist in actual operation list. 
for(var i=0; i<operations.length; i++)
{
if(operations[i] == "" || operations[i] == undefined)
{display_error("Please select an operation for every step. [Step " + (i+1).toString() + "]" ); return false;}

else if(!operation_name_list.includes(operations[i]))
{display_error("Data Corrupted. Please refresh and try again."); return false;}
}

//check if parameters are ok and urls are properly formatted for each stage
for(var i=0; i<operations.length; i++)
{
var param_name_list = [];     // list of param_names to check if they are unique

if (qc_object[operations[i]].param_list.length<1)
{display_error("Please add atleast 1 parameter for every operation. [" + operations[i] + "]"); return false;}
else
{ var param_list = qc_object[operations[i]].param_list;
for(var j=0; j<param_list.length; j++)
{
  if(!parameter_criticality_level.includes(param_list[j].level) || !data_types.includes(param_list[j].type)  )
  {display_error("Data Corrupted. Please refresh and try again."); return false;}

  if(!is_null(param_list[j].link) && !param_list[j].link.includes("https://"))
  {display_error("Please add https:// before all Parameter Reference Link urls. [" + param_list[j].name + " - " + operations[i] + "]"); return false;}

  if(param_list[j].name == "" || param_list[j].name == undefined)
  {display_error("Parameter Name cannot be blank. [" + operations[i] + "]"); return false;}
  else // add to param_name_list
  param_name_list.push(param_list[j].name);

  if(param_list[j].type == data_types[0] &&  (isNaN(param_list[j].value1) || isNaN(param_list[j].value2))   )     //Numeric Range type
  {display_error("Values should be a number for 'Numeric Range' type parameter. [" + param_list[j].name + " - " + operations[i] + "]"); return false;}

  if(param_list[j].type == data_types[1] &&  (param_list[j].value1 == "" || param_list[j].value1 == undefined)   ) //Option List type
  {display_error("Acceptable Option values required for 'Option List' type parameter. [" + param_list[j].name + " - " + operations[i] + "]"); return false;}

  if(param_list[j].type == data_types[2] &&  !gl_model_list.includes(param_list[j].value1)   ) //Sub-Assembly Part type
  {display_error("Data Corrupted. Please refresh and try again."); return false;}

  if(param_list[j].value1 == qc_object.model)
  {display_error("Sub-Assembly Part Model cannot be same as Current Plan Model. [" + param_list[j].name + " - " + operations[i] + "]"); return false;}

    //Free Response Value type - no validation

//              if(param_list[j].type == data_types[3] &&  (param_list[j].value1 == "" || param_list[j].value1 == undefined)   ) //Free Response Value type
//              {display_error("Value required for 'Free Response' type parameter."); return false;}

}


}

// Check if all parameter names in a particular operation are unique
var unique_param_name_list = new Set(param_name_list);
if( unique_param_name_list.size != param_name_list.length)
{
  display_error("All parameter names in an operation should be unique. [" + operations[i] + "]");
  return false;
}

}
return true;
}

function validate_maintenance_process_object (maintenance_object)             //return true if ok, else return false & display error message
{
const workstation_id = maintenance_object["workstation"];  
// check if workstation id is blank or undefined
if(workstation_id == "" || workstation_id == undefined ) {display_error("Data Corrupted. Please refresh and try again."); return false;}

if( isNaN(maintenance_object.cycle_time) || maintenance_object.cycle_time < 1 || is_null(maintenance_object.cycle_time))
{display_error("Periodic Maintenance Interval cannot be less than 1 Day"); return false;}



//check if parameters are ok and urls are properly formatted for each stage
var param_name_list = []; // check param names are unique

var param_list = maintenance_object.param_list;
for(var j=0; j<param_list.length; j++)
{
  if( !data_types.includes(param_list[j].type)  )
  {display_error("Data Corrupted. Please refresh and try again."); return false;}

  if(!is_null(param_list[j].link) && !param_list[j].link.includes("https://"))
  {display_error("Please add https:// before all Parameter Reference Link urls."); return false;}

  if(param_list[j].name == "" || param_list[j].name == undefined)
  {display_error("Parameter Name cannot be blank."); return false;}
  else // add to param_name_list
  param_name_list.push(param_list[j].name);

  if(param_list[j].type == data_types[0] &&  (isNaN(param_list[j].value1) || isNaN(param_list[j].value2))   )     //Numeric Range type
  {display_error("Values should be a number for 'Numeric Range' type parameter."); return false;}

  if(param_list[j].type == data_types[1] &&  (param_list[j].value1 == "" || param_list[j].value1 == undefined)   ) //Option List type
  {display_error("Acceptable Option values required for 'Option List' type parameter."); return false;}


    //Free Response Value type - no validation

//              if(param_list[j].type == data_types[3] &&  (param_list[j].value1 == "" || param_list[j].value1 == undefined)   ) //Free Response Value type
//              {display_error("Value required for 'Free Response' type parameter."); return false;}

}


// Check if all parameter names in a particular operation are unique
var unique_param_name_list = new Set(param_name_list);
if( unique_param_name_list.size != param_name_list.length)
{
  display_error("All parameter names in an operation should be unique");
  return false;
}


return true;
}

//Function to validate User Permission Object before saving
function validate_user_permission_obj(user_permission_obj)
{
var section_list = Object.keys(section_permission_list);
var section_keys_list = [];

for (var i=0; i< section_list.length; i++)                            // Get list of section keys
{
section_keys_list.push (section_permission_list[section_list[i]]);
}

var basic_info_keys_list = ["Basic Info"];
var operation_keys_list = Object.keys(gl_current_operations_list);                 // Get list of operation keys

var alert_keys_list = [];

for (var i=0; i< operation_keys_list.length; i++)                            // Get list of alert notification keys from Operation name keys
{
alert_keys_list.push (operation_keys_list[i]+"_an");
}



var full_keys_list = section_keys_list.concat(basic_info_keys_list);  // List of all keys
full_keys_list = full_keys_list.concat(alert_keys_list);
full_keys_list = full_keys_list.concat(operation_keys_list);

user_permission_obj_keys = Object.keys(user_permission_obj);

if(user_permission_obj_keys.length != full_keys_list.length)    
{
display_error("Data corrupted 0. Please refresh and try again.");
return false;
}


for (var i=0; i< full_keys_list.length; i++)
{
var key = full_keys_list[i];
var permission_value = user_permission_obj[key];

if( permission_value < 0 || permission_value > 3 )    // only 0, 1, 2, 3 - none, read, write, update
{
display_error("Data corrupted 2. Please refresh and try again.");
return false;
}

if( key == "Basic Info" && permission_value < 1)      // atleast read permission for "Basic Info". else error
{
display_error("Data corrupted 3. Please refresh and try again.");
return false;
}

}
return true;

}

//Function to validate production operations list before saving
function validate_proudction_operations_list(operation_list)
{

//  var current_operation_name_list = Object.keys(gl_current_operations_list);
  var new_opernation_name_list = Object.keys(operation_list);

if (new_opernation_name_list.length !== new Set(new_opernation_name_list).size) 
  {
    display_error("Operation names should be unique."); 
    clear_unsaved_operations();
    return false;
  }

if (new_opernation_name_list.indexOf("Basic Info") >= 0 || new_opernation_name_list.indexOf("Basic info") >= 0) // check if there is an operation called "Basic Info"     
  {
    display_error("Operation name cannot be 'Basic Info' "); 
    clear_unsaved_operations();
    return false;
  }

// Same data being saved
if (compare_objects(gl_current_operations_list,operation_list ) == true )
  {
    display_info("All operations already saved."); 
    clear_unsaved_operations();
    return false;
  }            

// Check no duplicates in workstation names
for(var i=0; i<new_opernation_name_list.length; i++ )
{
  if(operation_list[new_opernation_name_list[i]].length <=0)
  {
    display_error("Atleast one workstation is required for every operation."); 
    return false;
  }

  if(operation_list[new_opernation_name_list[i]].length != new Set(operation_list[new_opernation_name_list[i]]).size )
  {
    display_error("Workstation names in an operation should be unique."); 
    return false;
  }

  // check length of operation names
  if(new_opernation_name_list[i].length > param_name_max_length)
  {
    display_error("Internal error. Please refresh and try again.");
    clear_unsaved_operations();
    return false;
  }

  // check length of workstation names
  for(var j=0; j<operation_list[new_opernation_name_list[i]].length; j++ )
  {
    var workstation_name_value = operation_list[new_opernation_name_list[i]][j];

    if (workstation_name_value.length > param_name_max_length )
    {
      display_error("Internal error. Please refresh and try again.");
      return false;
    }
  }

}


return true; //all checks passed
}



////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                    Functions to Encode Data & Write to Database                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////      

/* 
RECORD UPDATE TYPES [UPDATE CODES]
0 - Basic Info - external_id first write
0.5 - Basic Info - external_id update
1 - First Write to Record for some operation
2 - Update to Record for some operation
3 [DELETED - allow multiple attachments] - Add parent_serial to basic info to link child / sub assembly part to parent / main - assembly component
4 - Deviation to Record for some operation
5 - Rejection of Record
*/

// Function to encode & create object for save / update operation parameters data in process plan
async function create_process_operation_record(data_container, current_operation, record, workstation_name = "default")
{
start_loading();
var future_record = copy_record(record);       // record state after changes are made

let update_record_obj = {};
var stage_status = 0;                                                   // 0 - complete, 1 - minor dev, 2- in progress, 3- major dev, 4 - rejected
var process_status = 0;

if( is_null(current_operation) ){ display_error("Data corrupted. Please refresh and try again"); return false;}

try
{
if (current_operation == "Basic Info")
{
    // Decide update type
    if( is_null(future_record[current_operation].log.entry_dt) )                 // if empty, no entry in "Basic Info yet" 
    {
      // check user permission
      if( (gl_user_permission.admin != 1 && gl_user_permission[current_operation] < permission_list_access.indexOf("Write")) 
          || permission_list_access.indexOf("Write") < 0 ) 
      {
        display_error("You do not have sufficient permissions for this operation.");
        return false; 
      }  

      //set "Basic Info" log for databse record object
      update_record_obj[current_operation + "." + "log" + "." + "entry_dt"] = firebase.firestore.FieldValue.serverTimestamp(); // entry date
      update_record_obj[current_operation + "." + "log" + "." + "entry_by"] = gl_curr_user_details.email; // entry by
      update_record_obj["Basic Info" + "." + "update_type"] = 0;                       //See [UPDATE CODES]
//      update_record_obj["Basic Info" + "." + "update_time"] = firebase.firestore.FieldValue.serverTimestamp();

      // update future_record state also
      future_record[current_operation].log.entry_dt = new Date(); // entry date
      future_record[current_operation].log.entry_by = gl_curr_user_details.email; // entry by
      future_record["Basic Info"].update_type = 0;
//      future_record["Basic Info"].update_time = new Date();


      var actual_value = data_container.childNodes[1].value;                // read value of external_id field
      var dispatch_remark = data_container.childNodes[4].value;             // read value of dispatch remark
      if ( is_null(actual_value) )
      {
        display_error("Please fill all input fields before saving.");
        return false;
      }
      
      update_record_obj["Basic Info" + "." + "external_id"] = actual_value;    // set external_id / dispatch_id
      update_record_obj[current_operation + "." + "log" + "." + "remark"] = dispatch_remark; // set dispatch remark

      future_record["Basic Info"].external_id = actual_value;
      future_record["Basic Info"]["log"].remark = dispatch_remark;

      var dbref = db.collection("app").doc(company_id).collection("records").doc(record["Basic Info"].serial);
      var result = await dbref.update(update_record_obj);                        // update database

      gl_curr_record = future_record;                                   // set record to future_record on success
      return true;
    }
    else                                                                            // data already entered once in "Basic Info" 
    {

      // check user permission
      if( (gl_user_permission.admin != 1 && gl_user_permission[current_operation] < permission_list_access.indexOf("Update")) 
          || permission_list_access.indexOf("Update") < 0 ) 
      {
        display_error("You do not have sufficient permissions for this operation.");
        return false; 
      }  

      //set "Basic Info" log for databse record object
      update_record_obj[current_operation + "." + "log" + "." + "update_dt"] = firebase.firestore.FieldValue.serverTimestamp(); // entry date
      update_record_obj[current_operation + "." + "log" + "." + "update_by"] = gl_curr_user_details.email; // entry by
      update_record_obj["Basic Info" + "." + "update_type"] = 0.5;                       //See [UPDATE CODES]
//      update_record_obj["Basic Info" + "." + "update_time"] = firebase.firestore.FieldValue.serverTimestamp();

      // update future_record state also
      future_record[current_operation].log.update_dt = new Date(); // entry date
      future_record[current_operation].log.update_by = gl_curr_user_details.email; // entry by
      future_record["Basic Info"].update_type = 0.5;
//      future_record["Basic Info"].update_time = new Date();

      var actual_value = data_container.childNodes[1].value;                // read value of external_id field
      var dispatch_remark = data_container.childNodes[4].value;             // read value of dispatch remark

      if ( is_null(actual_value) )
      {
        display_error("Please fill all input fields before saving.");
        return false;
      }
      
      update_record_obj["Basic Info" + "." + "external_id"] = actual_value;    // set external_id
      update_record_obj[current_operation + "." + "log" + "." + "remark"] = dispatch_remark; // set dispatch remark

      future_record["Basic Info"].external_id = actual_value;
      future_record["Basic Info"]["log"].remark = dispatch_remark;


      var dbref = db.collection("app").doc(company_id).collection("records").doc(record["Basic Info"].serial);
      var result = await dbref.update(update_record_obj);                        // update database

      gl_curr_record = future_record;                                   // set record to future_record on success
      return true;
    }
}
else                                                                             // operation other than "Basic Info"
{

  if ( is_null(future_record[current_operation].log.entry_dt) )                  // First entry to an operation
  {

    // check user permission
    if( (gl_user_permission.admin != 1 && gl_user_permission[current_operation] < permission_list_access.indexOf("Write")) 
        || permission_list_access.indexOf("Write") < 0) 
      {
    display_error("You do not have sufficient permissions for this operation.");
    return false; 
      }              

    // Error if previous step is still incomplete or part is rejected
    var current_step_index = (Object.keys(future_record)).indexOf(current_operation);

    if( current_step_index > (current_process_status(future_record)).operation_index )
    {
      display_error("Previous operation has to be completed before current operation can be updated.");
      return false; 
    }
    if( future_record["Basic Info"].status == 4 )
    {
      display_error("Data could not be saved as part is already rejected.");
      return false; 
    }

    if( is_null(workstation_name) )
    {
      display_error("Please select Workstation ID before saving."); // Show error if workstation name is empty
      return false;
    }

  // get param_list & actual_values
  var param_list = record[current_operation].param_list;    // get param list
  var actual_value_list = {};

  for(var i=0; i<param_list.length; i++)
    {
      var actual_value = data_container.childNodes[4*i+1].value;

      if( String(actual_value) != "0" && is_null(actual_value) )     // Show error if input value field is empty & return false
      {
        display_error("Please fill all input fields before saving.");
        return false;
      }

      if ( ! await validate_input_field_value(param_list[i].type, param_list[i].value1, param_list[i].value2, actual_value) )
      {
        if (param_list[i].level == parameter_criticality_level[0] )       // "Minor" deviation - status 1
        stage_status = Math.max(stage_status, 1);                           
        else if (param_list[i].level == parameter_criticality_level[1])   // "Major" deviation - status 3
        stage_status = Math.max(stage_status, 3);                           
      }

      // cache flage 1 indicates value is from frequency sample. not actual measurement
      var cache_flag = get_cache_flag_value_on_record_save(future_record["Basic Info"].model,current_operation,param_list[i].name,actual_value,param_list[i].freq);
      
      actual_value_list[param_list[i].name] = [actual_value, cache_flag];
    }

  future_record[current_operation].status = stage_status;

  // Set overall stage status - max value of all stage statuses
  var operation_list = Object.keys(future_record);
  for(var i=1; i<operation_list.length; i++)
  { process_status = Math.max(process_status, future_record[operation_list[i]].status); }

  var progress_obj = current_process_status(future_record);

  update_record_obj["Basic Info" + "." + "current_op"] = current_operation;                      // operation being updated now
  update_record_obj["Basic Info" + "." + "pending_op"] = progress_obj.current_operation;         // next operation pending
  update_record_obj["Basic Info" + "." + "status"] = process_status;                             // set overall process status
  update_record_obj[current_operation + "." + "actual_value"] = actual_value_list;               // set object containg actual param values
  update_record_obj[current_operation + "." + "status"] = stage_status;                          // set stage status
  update_record_obj[current_operation + "." + "workstation"] = workstation_name;                 // set workstation name


  // set log
  update_record_obj[current_operation + "." + "log" + "." + "entry_dt"] = firebase.firestore.FieldValue.serverTimestamp(); // entry date
  update_record_obj[current_operation + "." + "log" + "." + "entry_by"] = gl_curr_user_details.email; // entry by
  update_record_obj["Basic Info" + "." + "update_type"] = 1;                       //See [UPDATE CODES] - First write to operation
  update_record_obj["Basic Info" + "." + "update_time"] = firebase.firestore.FieldValue.serverTimestamp();


  // update future_record state also
  future_record["Basic Info"].current_op = current_operation;                      
  future_record["Basic Info"].pending_op = progress_obj.current_operation;         
  future_record["Basic Info"].status = process_status;                             
  future_record[current_operation].actual_value = actual_value_list;               
  future_record[current_operation].status = stage_status;   
  future_record[current_operation].workstation = workstation_name;

  // set log
  future_record[current_operation].log.entry_dt = new Date(); // entry date
  future_record[current_operation].log.entry_by = gl_curr_user_details.email; // entry by
  future_record["Basic Info"].update_type = 1;         
  future_record["Basic Info"].update_time = new Date();

  var dbref = db.collection("app").doc(company_id).collection("records").doc(future_record["Basic Info"].serial);
  var result = await dbref.update(update_record_obj);               // write entry to database
  gl_curr_record = future_record;                                   // set record to future_record on success
 
  update_cache(future_record["Basic Info"].model, current_operation, future_record);
 
  return true;

  }
  else                                                                           // Update to an operation
  {

    // check user permission
    if( (gl_user_permission.admin != 1 && gl_user_permission[current_operation] < permission_list_access.indexOf("Update")) 
        || permission_list_access.indexOf("Update") < 0 ) 
    {
    display_error("You do not have sufficient permissions for this operation.");
    return false; 
    }  


    // Error if previous step is still incomplete or part is rejected
    var current_step_index = (Object.keys(future_record)).indexOf(current_operation);

    if( current_step_index > (current_process_status(future_record)).operation_index && future_record[current_operation].status == 2 )
    {
      display_error("Previous operation has to be completed before current operation can be updated.");
      return false; 
    }
    if( future_record["Basic Info"].status == 4 )
    {
      display_error("Data could not be saved as part is already rejected.");
      return false; 
    }
    if( is_null(workstation_name) )
    {
      display_error("Please select Workstation ID before saving."); // Show error if workstation name is empty
      return false;
    }

  // get param_list & actual_values
  var param_list = record[current_operation].param_list;    // get param list
  var actual_value_list = {};

  for(var i=0; i<param_list.length; i++)
    {
      var actual_value = data_container.childNodes[4*i+1].value;

      if( String(actual_value) != "0" && is_null(actual_value) )     // Show error if input value field is empty & return false
      {
        display_error("Please fill all input fields before saving.");
        return false;
      }

      if ( !await validate_input_field_value(param_list[i].type, param_list[i].value1, param_list[i].value2, actual_value) )
      {
        if (param_list[i].level == parameter_criticality_level[0] )       // "Minor" deviation - status 1
        stage_status = Math.max(stage_status, 1);                           
        else if (param_list[i].level == parameter_criticality_level[1])   // "Major" deviation - status 3
        stage_status = Math.max(stage_status, 3);                           
      }

      // cache flage 1 indicates value is from frequency sample. not actual measurement
      var cache_flag =  get_cache_flag_value_on_record_update(future_record[current_operation].actual_value[param_list[i].name][0],
                                                              actual_value, future_record[current_operation].actual_value[param_list[i].name][1]);
      actual_value_list[param_list[i].name] = [actual_value, cache_flag];
    }

  future_record[current_operation].status = stage_status;

  // Set overall stage status - max value of all stage statuses
  var operation_list = Object.keys(future_record);
  for(var i=1; i<operation_list.length; i++)
  { process_status = Math.max(process_status, future_record[operation_list[i]].status); }

  var progress_obj = current_process_status(future_record);

  update_record_obj["Basic Info" + "." + "current_op"] = current_operation;                      // operation being updated now
  update_record_obj["Basic Info" + "." + "pending_op"] = progress_obj.current_operation;         // next operation pending
  update_record_obj["Basic Info" + "." + "status"] = process_status;                             // set overall process status
  update_record_obj[current_operation + "." + "actual_value"] = actual_value_list;               // set object containg actual param values
  update_record_obj[current_operation + "." + "status"] = stage_status;                          // set stage status
  update_record_obj[current_operation + "." + "workstation"] = workstation_name;                 // set workstation name

  // set log
  update_record_obj[current_operation + "." + "log" + "." + "update_dt"] = firebase.firestore.FieldValue.serverTimestamp(); // entry date
  update_record_obj[current_operation + "." + "log" + "." + "update_by"] = gl_curr_user_details.email; // entry by
  update_record_obj["Basic Info" + "." + "update_type"] = 2;                       //See [UPDATE CODES] - First write to operation
  update_record_obj["Basic Info" + "." + "update_time"] = firebase.firestore.FieldValue.serverTimestamp();


  // update future_record state also
  future_record["Basic Info"].current_op = current_operation;                      
  future_record["Basic Info"].pending_op = progress_obj.current_operation;         
  future_record["Basic Info"].status = process_status;                             
  future_record[current_operation].actual_value = actual_value_list;               
  future_record[current_operation].status = stage_status;   
  future_record[current_operation].workstation = workstation_name;   

  // set log
  future_record[current_operation].log.update_dt = new Date(); // update date
  future_record[current_operation].log.update_by = gl_curr_user_details.email; // update by
  future_record["Basic Info"].update_type = 2;         
  future_record["Basic Info"].update_time = new Date();

  var dbref = db.collection("app").doc(company_id).collection("records").doc(future_record["Basic Info"].serial);
  var result = await dbref.update(update_record_obj);               // write entry to database
  gl_curr_record = future_record;                                   // set record to future_record on success

  return true;
  


  }
}

}
catch(error)
{
  console.log(error);
display_error("Operation failed. Please try again later.");
return false;
}

}


// Function to encode & allow deviation operation in process plan
async function allow_deviation_operation_record(current_operation, record, remark)
{
start_loading();  
try
{
var dbref = db.collection("app").doc(company_id).collection("records").doc(record["Basic Info"].serial);
var future_record = JSON.parse(JSON.stringify(record));       // record state after changes are made
future_record[current_operation].status = 0;                  // set status of current operation to 0 - complete
var process_status = current_process_status(future_record);   // get process_status of future record

var result = await dbref.update(
{
// Set values for current operation
[current_operation + "." + "status"] : 0,
[current_operation + "." + "log" + "." + "deviation_dt"] : firebase.firestore.FieldValue.serverTimestamp(),
[current_operation + "." + "log" + "." + "deviation_by"] : gl_curr_user_details.email,
[current_operation + "." + "log" + "." + "remark"] : remark,

// Update values in Basic Info
["Basic Info" + "." + "status"] : process_status.current_status_value,     //overall process status of future_record
["Basic Info" + "." + "current_op"] : current_operation,                   // operation where deviation is being allowed. If complete -> value = 0
["Basic Info" + "." + "pending_op"] : process_status.current_operation,    // next operation to be done. If complete -> value = ""
["Basic Info" + "." + "update_type"] : 4,                           // [UPDATE CODES] - See list above for key
["Basic Info" + "." + "update_time"] : firebase.firestore.FieldValue.serverTimestamp()
});

// Update local copy of curr_record after database write is successful
record[current_operation].status = 0;
record[current_operation].log.deviation_dt = new Date();
record[current_operation].log.deviation_by = gl_curr_user_details.email;
record[current_operation].log.remark = remark;

record["Basic Info"].status = process_status.current_status_value;
record["Basic Info"].current_op = current_operation;
record["Basic Info"].pending_op = process_status.current_operation;
record["Basic Info"].update_type = 4;
record["Basic Info"].update_time = new Date();

gl_curr_record = record;

var select_con = document.getElementById("qc_stage_select_list");
var qc_data_display_con = document.getElementById("serial_qc_data_display");
await display_qc_stage_info_card(select_con, qc_data_display_con, gl_curr_record, false);
display_info("Data saved successfully");
return true;
}

catch(error)
{
display_error("Operation could not be completed. Please try again later.");
return false;
}

}


// Function to encode & allow rejection operation in process plan
async function allow_rejection_operation_record(current_operation, record, remark)
{
start_loading();  
try
{
var dbref = db.collection("app").doc(company_id).collection("records").doc(record["Basic Info"].serial);
var future_record = JSON.parse(JSON.stringify(record));       // record state after changes are made
future_record[current_operation].status = 4;                  // set status of current operation to 4 - rejected
var process_status = current_process_status(future_record);   // get process_status of future record

var result = await dbref.update(
{
// Set values for current operation
[current_operation + "." + "status"] : 4,                     // Reject status = 4
[current_operation + "." + "log" + "." + "deviation_dt"] : firebase.firestore.FieldValue.serverTimestamp(),
[current_operation + "." + "log" + "." + "deviation_by"] : gl_curr_user_details.email,
[current_operation + "." + "log" + "." + "remark"] : remark,

// Update values in Basic Info
["Basic Info" + "." + "status"] : process_status.current_status_value,     //overall process status of future_record
["Basic Info" + "." + "current_op"] : current_operation,                   // operation where deviation is being allowed. If complete -> value = 0
["Basic Info" + "." + "pending_op"] : current_operation,    // next operation to be done. 
["Basic Info" + "." + "update_type"] : 5,                           // [UPDATE CODES] - See list above for key
["Basic Info" + "." + "update_time"] : firebase.firestore.FieldValue.serverTimestamp()

});

// Update local copy of curr_record after database write is successful
record[current_operation].status = 4;
record[current_operation].log.deviation_dt = new Date();
record[current_operation].log.deviation_by = gl_curr_user_details.email;
record[current_operation].log.remark = remark;

record["Basic Info"].status = process_status.current_status_value;
record["Basic Info"].current_op = current_operation;
record["Basic Info"].pending_op = current_operation;
record["Basic Info"].update_type = 5;
record["Basic Info"].update_time = new Date();


gl_curr_record = record;

var select_con = document.getElementById("qc_stage_select_list");
var qc_data_display_con = document.getElementById("serial_qc_data_display");
await display_qc_stage_info_card(select_con, qc_data_display_con, gl_curr_record, false);
display_info("Data saved successfully");

return true;
}

catch(error)
{
display_error("Operation could not be completed. Please try again later.");
return false;
}
}


// --------------------------------------------------------------------------------------------------------------------------

// Functions to Create / Update Process Disruption Records

async function create_process_disruption_record(reason, operation, workstation, remark)
{

  try
  {
      var disruption_record = {
        ["reason"] : reason,
        ["operation"] : operation,
        ["workstation"] : workstation,
        ["remark"] : remark,             
        ["start_user"] : gl_curr_user_details.email,
        ["start_time"] : firebase.firestore.FieldValue.serverTimestamp(),
        ["end_time"] : "",
        ["end_user"] : ""
    };

    // create disruption main doc
    var dbref = db.collection("app").doc(company_id).collection("disruptions");
    const disruption_doc_ref = await dbref.add(disruption_record);

    var updated_alert = copy_disruption_record(gl_disruption_alerts);

    updated_alert.push({
            ["id"] : disruption_doc_ref.id,
            ["operation"] : operation,
            ["workstation"] : workstation, 
            ["reason"] : reason,
            ["remark"] : remark,             
            ["start_user"] : gl_curr_user_details.email,
            ["start_time"] : new Date()
        });

    await alert_notification_update(updated_alert)

    display_info("Disruption reported successfully")
    return true;     
  }
  catch(e)
  {
    display_error("Process Disruption Report could not be created. Please try again later or contact your system administrator.");
    return false;
  }
                   
}


async function close_process_disruption_record(document_id)
{
  try
  {
    var disruption_record = 
    {
      ["end_time"] : firebase.firestore.FieldValue.serverTimestamp(),
      ["end_user"] : gl_curr_user_details.email
    };

  // create disruption main doc
  var dbref = db.collection("app").doc(company_id).collection("disruptions").doc(document_id);
  const disruption_doc_ref = await dbref.update(disruption_record);


  var updated_alert = copy_disruption_record(gl_disruption_alerts);
  
  var temp_disruption_list = []; 

  var closed_disruption_record;

  for(var i=0; i<updated_alert.length; i++ )
  {
    if(updated_alert[i].id != document_id )
    temp_disruption_list.push(updated_alert[i]);
    else
    closed_disruption_record = updated_alert[i];
  }

  updated_alert = temp_disruption_list;
  await alert_notification_update(updated_alert);

  //Prompt for "Corrective Maintenance Update" if user has permission
  const selected_workstation = closed_disruption_record.workstation + " (" + closed_disruption_record.operation + ")";
  const disruption_reason = closed_disruption_record.reason;

  if ((gl_user_permission.admin == 1 || gl_user_permission[section_permission_list["Update Maintenance Records"]] == 1)
      && disruption_reason == disruption_reasons[0])
  {
    await await_loading(create_maintenance_update_modal,selected_workstation, "Corrective");  
  }
  else
  {
    await display_info("Disruption status updated successfully")
  }

  return true;
  }
  catch(e)
  {
    console.log(e);
    await initialize_process_disruption_section();
    display_error("Process Disruption status could not be updated. Please try again later or contact your system administrator.");
    return false;
  }
}



// --------------------------------------------------------------------------------------------------------------------------

// Functions to Save Maintenance Record Updates

async function write_maintenance_record(maintenance_record_object)
{
    try
    {
      console.log(maintenance_record_object);

      var dbref = db.collection("app").doc(company_id).collection("maintenance_record");
      var result = await dbref.add(maintenance_record_object);

      if(maintenance_record_object.type == "Preventive")
      {
        gl_maintenance_updates_list[maintenance_record_object.workstation].last_update = new Date();
        await initialize_maintenance_updates_section(1);  
      }

      display_info("Data saved successfully");

      return true;
    }

  catch(error)
    {
      console.log(error);
      display_error("Operation could not be completed. Please try again later.");
      return false;
    }
}




// --------------------------------------------------------------------------------------------------------------------------


//Function to encode & create object for Maintenance Plan
async function create_maintenance_plan_object(maintenance_stage_container_id , workstation_header_field) 
{
start_loading();  
let maintenance_object = {};
var workstation_name = document.getElementById(workstation_header_field).workstation_id;
maintenance_stage_container = document.getElementById(maintenance_stage_container_id);

var cycle_time = maintenance_stage_container.childNodes[0].childNodes[0].childNodes[1].value;

maintenance_object["workstation"] = workstation_name;
maintenance_object["cycle_time"] = Number(cycle_time);
maintenance_object["param_list"] = [];


var parameter_list_container = maintenance_stage_container.childNodes[0].childNodes[1];

for(var j=0; j<parameter_list_container.childElementCount; j++)
  {         

    var param_group = {
                        name : parameter_list_container.childNodes[j].childNodes[1].value,    //parameter name
                        link : parameter_list_container.childNodes[j].childNodes[3].value,    //parameter reference url
                        type : parameter_list_container.childNodes[j].childNodes[5].value,    //type - numeric range, option list, etc
                        value1 : parameter_list_container.childNodes[j].childNodes[6].value,  //input value 1 field  based on parameter type
                        value2 : parameter_list_container.childNodes[j].childNodes[7].value,   //input value 2 field  based on parameter type
                      };

    maintenance_object["param_list"].push(param_group);
  }


if (!is_null(gl_curr_maintenance_plan) && compare_objects(gl_curr_maintenance_plan, maintenance_object) )
{
await display_info("Data already saved");
return true;
}


if(!validate_maintenance_process_object (maintenance_object)) return false;

// Global doc to montor maintenance due dates
var global_maintenance_list_obj = {
                                    "cycle_time" : Number(maintenance_object["cycle_time"])
                                  };

if(is_null(gl_curr_maintenance_plan)) global_maintenance_list_obj["last_update"] = firebase.firestore.FieldValue.serverTimestamp();

// Update database
try
{
// update global -> scheduled_maintenance_list in database
var dbref = db.collection("app").doc(company_id).collection("global").doc("maintenance_list");
let res = await dbref.set( { [ workstation_name ] : global_maintenance_list_obj}, {merge:true} ); 

// save maintenance_plan in database
dbref = db.collection("app").doc(company_id).collection("maintenance_plan").doc(workstation_name);
res = await dbref.set(maintenance_object);



// set current gl_curr_maintenance_plan to maintenance_object
gl_curr_maintenance_plan = maintenance_object;

display_info("Data saved successfully");

return true;
}
catch(error)
{
display_error("Operation failed. Please try again later.");
return false;
}


}

//Function to delete maintenance plan and remove entry from global maintenance object
// mode = 1 indicates not called from maintenance plan configuration section
async function delete_maintenance_plan(workstation_names_list, mode = 0)
{
  try{
        var removed_workstation_object = {};

        for(var i=0; i<workstation_names_list.length; i++)
        {
          removed_workstation_object[workstation_names_list[i].toString()] = firebase.firestore.FieldValue.delete();

        // delete maintenance_plan in database
        var dbref = db.collection("app").doc(company_id).collection("maintenance_plan").doc(workstation_names_list[i].toString());
        await dbref.delete();
        }

        console.log(removed_workstation_object);

        // update global -> scheduled_maintenance_list in database
        var dbref = db.collection("app").doc(company_id).collection("global").doc("maintenance_list");
        let res = await dbref.update( removed_workstation_object ); 
        
        if(mode==0)
        {
          gl_curr_maintenance_plan = {};
          await initialize_configure_maintenance_plan_section();
          display_info("Maintenance Plan deleted successfully");  
        }

        return true;
     }
     catch(error)
     {
      console.log(error);
      
      // display error for mode 0, else fail silently as document does not exist
      if(mode==0)
      display_error("Operation Failed. Please try again later.");
      
      return false;
     }
}

// --------------------------------------------------------------------------------------------------------------------------



// Support Function to convert & encode qc_process object to a qc_record. New serial numbers can be created by copying the qc_record & editing serial number.
// Makes validation easier & better while creating new serial number.
function convert_qc_object_to_record(process_obj, model)
{
var operation_list = Object.keys(process_obj);                     

var record = 
        {
          ["Basic Info"] :
                          {
                            serial : "",
                            model : model,
                            status : 2,                        // In progress = 2
                            external_id : "",
                            current_op : "",
                            pending_op : "",
                            op_order : operation_list,        // Array showing order of operations. Operation order of object keys is not preserved in database.
                            update_type : ".",
                            update_time : firebase.firestore.FieldValue.serverTimestamp(),
                            log : {
                                    entry_dt: "",
                                    entry_by: "",
                                    update_dt: "",
                                    update_by: ""
                                  }
                          }

        };



for (var i =0; i< operation_list.length; i++)
{
var param_list = process_obj[operation_list[i]].param_list;     // param list stored in qc_process
var actual_value_obj = {};                                      // object containing actual values. to be added to record

for( var j=0; j<param_list.length; j++)                         
{
actual_value_obj[param_list[j].name] = "";                    // add parameter names as keys
}

var log_obj = {                                                 // empty log object
              entry_dt: "",
              entry_by: "",
              update_dt: "",
              update_by: "",
              deviation_dt:  "",
              deviation_by: "",
              remark: ""
            };

var stage_obj = {                                                // create stage object for each operation
                ["workstation"] : "",
                ["status"] : 2,
                ["cycle_time"] : process_obj[operation_list[i]].cycle_time,
                ["param_list"] : param_list,
                ["log"] : log_obj,
                ["actual_value"] : actual_value_obj
              };

record[operation_list[i]] = stage_obj;                          // add stage_obj to record with operation name key

}
return record;
}

//Function to encode & create object for QC Process Plan
async function create_qc_process_object(qc_stage_container_id , model_header_field) 
{
start_loading();  
let qc_object = {};
var model = document.getElementById(model_header_field).model_id;
qc_stage_container = document.getElementById(qc_stage_container_id);

for(var i=0; i<qc_stage_container.childElementCount;i++)
{
var stage_name = qc_stage_container.childNodes[i].childNodes[0].childNodes[1].value;
var cycle_time = qc_stage_container.childNodes[i].childNodes[0].childNodes[2].value;

qc_object[stage_name] = {};                   //initialize properties
qc_object[stage_name].param_list = [];         
qc_object[stage_name].cycle_time = cycle_time;


var parameter_list_container = qc_stage_container.childNodes[i].childNodes[1];



for(var j=0; j<parameter_list_container.childElementCount; j++)
  {         
    if(Number(parameter_list_container.childNodes[j].childNodes[9].value)<1)
    parameter_list_container.childNodes[j].childNodes[9].value=Number(1);

    var param_group = {
                        name : parameter_list_container.childNodes[j].childNodes[1].value,    //parameter name
                        level : parameter_list_container.childNodes[j].childNodes[3].value,   //criticality of parameter - Minor / Major
                        link : parameter_list_container.childNodes[j].childNodes[5].value,    //parameter reference url
                        method : parameter_list_container.childNodes[j].childNodes[7].value,    //parameter measurement method, eg - vernier caliper, visual, etc
                        freq : Number(parameter_list_container.childNodes[j].childNodes[9].value),    //freq - measurement frequency of parameter - eq- if 10, then check parameter once out of 10 parts
                        type : parameter_list_container.childNodes[j].childNodes[11].value,    //type - numeric range, option list, etc
                        value1 : parameter_list_container.childNodes[j].childNodes[12].value,  //input value 1 field  based on parameter type
                        value2 : parameter_list_container.childNodes[j].childNodes[13].value   //input value 2 field  based on parameter type
                      };

    qc_object[stage_name].param_list.push(param_group);
  }
}

if (!is_null(gl_curr_process_plan) && compare_objects(gl_curr_process_plan, qc_object) )
{
await display_info("Data already saved");
return true;
}

if(!validate_qc_process_object (qc_object,model)) return false;

var qc_record = convert_qc_object_to_record(qc_object, model);


// Update database
try
{
// save process_plan_record in database
var dbref = db.collection("app").doc(company_id).collection("process_plan").doc(model);
let res = await dbref.set(qc_record);

// update global -> model_list in database
if(gl_model_list.indexOf(model) < 0 )
{
dbref = db.collection("app").doc(company_id).collection("global").doc("model_list");
res = await dbref.update( { val: firebase.firestore.FieldValue.arrayUnion(model) }  ); 
gl_model_list.push(model);
}

// set currentgl_curr_process_plan to qc_object
gl_curr_process_plan = qc_object;

display_info("Data saved successfully");

return true;
}
catch(error)
{
display_error("Operation failed. Please try again later.");
return false;
}


}

/* Firestore security rules - 

Validation while creating qc_process_plan / record

Basic Checks-
check-> record["Basic Info"].model == request path model
check-> record["Basic Info"].status == 2
check -> record["Basic Info"].update_type === "."
check-> record["Basic Info"].update_time == request.time
check -> "Basic Info" object keys
check-> max keys & keys > 2 (atleast "Basic Info" + 1 operation)
check-> no duplicate operations
check-> no empty operation
check-> sub keys of each operation !?

check-> user.customClaims company != "" && company_id match document path 

Checks with additional reads-      
check-> user.customClaims for permission to create qc_process_plan / record

======================================================================================

Validation while editing global - model_list

Basic Checks-
check-> user.customClaims company != "" && company_id match document path 
check-> user.customClaims for permission to creat qc_process_plan / record      

Checks with additional reads-      
check-> array.val difference has only 1 changed value
check-> is qc_process_plan object exists
*/


// --------------------------------------------------------------------------------------------------------------------------





//Function to encode & create user permission object
async function create_user_permission_object(stage_permission_container, alert_notification_container, basic_info_permission_container, operation_permission_container , user_email_header_field, old_user_permission_obj)
{
start_loading();
// if no permission to add / edit users. (0 - no)
if (gl_user_permission.admin != 1 && gl_user_permission[section_permission_list["Configure Users"]] == permission_list_no_yes[0] )   
{
display_error("You do not have sufficient permissions for this operation.");
return false;
}

user_email = document.getElementById(user_email_header_field).user_email;

var user_permission_obj = {};

var section_list = Object.keys(section_permission_list);                                 
if( is_null(gl_current_operations_list))
gl_current_operations_list = await read_production_operations_list();

var operation_list = Object.keys(gl_current_operations_list);

for(var i=0; i< section_list.length; i++)                  // Get permissions for sections
{
var permission_key = section_permission_list[section_list[i]];            // convert permission name to key. eg -> sp_dashboard
var permission_value = stage_permission_container.childNodes[i].childNodes[1].value;    // get permission value - yes / no
permission_value = permission_list_no_yes.indexOf(permission_value);                    // convert no / yes to 0 /1 

if( user_email == gl_curr_user_details.email && permission_key == section_permission_list["Configure Users"])
permission_value = gl_user_permission[permission_key];                   // for self email - can't remove user editing access. reset to original permission

user_permission_obj[permission_key] = permission_value;                    // add to user permission object
}

for(var i=0; i< operation_list.length; i++)                  // Get permissions for alert notifications
{
var permission_key = operation_list[i] + "_an";            // convert operation name to key by adding "_an" eg -> operation1_an
var permission_value = alert_notification_container.childNodes[i].childNodes[1].value;    // get permission value - yes / no
permission_value = permission_list_no_yes.indexOf(permission_value);                    // convert no / yes to 0 /1 

user_permission_obj[permission_key] = permission_value;                    // add to user permission object
}

for(var i=0; i< 1; i++)               // Get permissions for Basic Info
{
var permission_key = "Basic Info";                           // only Basic Info
var permission_value = basic_info_permission_container.childNodes[i].childNodes[1].value;    // get permission value - none, read, write, update
permission_value = permission_list_access.indexOf(permission_value);                    // convert to 0 , 1 , 2, 3

user_permission_obj[permission_key] = permission_value;                    // add to user permission object
}


for(var i=0; i< operation_list.length; i++)               // Get permissions for operations
{
var permission_key = operation_list[i];            // convert permission name to key. eg -> sp_dashboard
var permission_value = operation_permission_container.childNodes[i].childNodes[1].value;    // get permission value - none, read, write, update
permission_value = permission_list_access.indexOf(permission_value);                    // convert to 0 , 1 , 2, 3

user_permission_obj[permission_key] = permission_value;                    // add to user permission object
}


if ( !validate_user_permission_obj(user_permission_obj) )
{
display_error("Operation failed. Please try again later.");
return false;
}

if (is_null(old_user_permission_obj) ) old_user_permission_obj = {};

if( compare_objects(user_permission_obj, old_user_permission_obj) == true )
{
display_info("Data already saved");
return true;
}

// Update database

var dbref = db.collection("app").doc(company_id).collection("users").doc(user_email);
try
{
  await dbref.update(user_permission_obj);

  if(user_email == gl_curr_user_details.email)
    {
      window.location.reload();
      display_info("Data saved successfully");

    }
  else
    {
    initialize_user_permission_section();
    display_info("Data saved successfully");
    }
  return true;
}
catch(error)
{
  console.log(error);
display_error("Operation failed. Please try again later.");
return false;
}



}

/* Firestore security rules - 

Validation while setting user permissions

Basic Checks-
check-> user.customClaims company != "" && company_id match document path 
check-> request.resource.data["Basic Info"] >=1 
check-> self permission -> can't remove user permission edit access

check-> max keys & keys > 3 (atleast "Basic Info" + company_id + company) + section_keys + operation_keys
check-> values of section_keys are 0 or 1

Checks with additional reads-      
check-> user.customClaims for permission to edit user permissions
check-> keys iclude only "Basic Info", section_keys + operation_keys
*/


// Function to create a new user with email & password
async function create_new_user (email_field, password_field)
{
start_loading();  
var email = document.getElementById(email_field).value;
var password = document.getElementById(password_field).value;


// 1 = yes. Check user permission
if ( gl_user_permission.admin != 1 && gl_user_permission[section_permission_list["Configure Users"]] != 1 )
{
display_error("Unauthorized request");
return false;
}      

else if (!validate_input(email) || !validate_input(password))
{
display_error("Email / Password cannot be blank");
return false;
}

else if ( !validate_email(email) )
{
display_error("Please enter a valid email");
return false;
}

else if(password.length < 10)
{
display_error("Password should be minimum 10 characters");
return false;
}

else if (gl_user_list.indexOf(email) >=0 )     // user already exists
{
display_info("User already exists");
return false;
}


try
{
const add_new_user = functions.httpsCallable('add_new_user');
var res = await add_new_user({email:email, password:password});

if(gl_user_list.indexOf(email) < 0 ) gl_user_list.push(email);

initialize_user_permission_section();

display_info("User created successfully");
}
catch(error)
{
display_error(error.message);
return false;
}

}

// Function to delete user
async function delete_user(user_email_header_field)
{
  start_loading();  
try
{
var user_email = document.getElementById(user_email_header_field).user_email;

if (user_email == gl_curr_user_details.email )
{
display_error("Can't delete own account");
return false;
}



// if no permission to add / edit users. (0 - no)
if ( gl_user_permission.admin != 1 && gl_user_permission[section_permission_list["Configure Users"]] == 0 )
{
display_error("You do not have sufficient permissions for this operation.");
return false;
}


const dbref = db.collection("app").doc(company_id).collection("users").doc(user_email);
var res = await dbref.delete();
gl_user_list = remove_string_from_array(gl_user_list, user_email);       // remove user from global user list
initialize_user_permission_section(true);
display_info("User deleted successfully");
return true;
}
catch(error)
{
display_error("Operation failed. Please try again later");
return false;
}
}


// --------------------------------------------------------------------------------------------------------------------------
// Function to update notification list for events like low credit, machine maintenace, etc
async function write_notification_list(low_credit_notification_list,maintenance_notification_list)
{
  var final_low_credit_list= [];
  var final_maintenance_list= [];
  try
  {
    for(var i=0; i<low_credit_notification_list.length; i++)
    {
      if(!validate_email(low_credit_notification_list[i]) && low_credit_notification_list[i]!="")
      {
        display_error("<b>Invalid email</b> entered for <b>Low Credit Balance Notifications</b>. Please check and try again.");
        return false;
      }

      if(validate_email(low_credit_notification_list[i])) final_low_credit_list.push(low_credit_notification_list[i]);
    }

    for(var i=0; i<maintenance_notification_list.length; i++)
    {
      if(!validate_email(maintenance_notification_list[i]) && maintenance_notification_list[i]!="")
      {
        display_error("<b>Invalid email</b> entered for <b>Machine Maintenance Notifications</b>. Please check and try again.");
        return false;
      }
      if(validate_email(maintenance_notification_list[i])) final_maintenance_list.push(maintenance_notification_list[i]);
    }

    var dbref = db.collection("app").doc(company_id).collection("global").doc("alert_subscriber_list");
    var res = await dbref.update({
                                    "low_credit":final_low_credit_list,
                                    "maintenance":final_maintenance_list
                                 });

    display_info("Notification settings updated successfully");
    return true;
  }
  catch(e)
  {
    display_error("Notification settings could not be updated. Please try again later.");
    return false;
  }

}


/* Firestore security rules - 

Validation while deleting user

Basic Checks-
check-> user.customClaims company != "" && company_id match document path 
check-> user.customClaims for permission to edit user permissions
check-> auth.email != email of user being deleted

*/


// --------------------------------------------------------------------------------------------------------------------------


//Function to encode, validate & save production operations list
async function save_production_operation_list()
{
start_loading();  
var operation_list = {};

var container = document.getElementById("production_operation_list_dynamic");
var operation_count = container.childElementCount;

for(var i=0;i<operation_count;i++)
{
var operation_name = container.childNodes[i].childNodes[0].childNodes[1].value;
var workstation_name_list = [];
var workstation_container = container.childNodes[i].childNodes[1];

if (operation_name !== "") 
  {

    // get list of workstation names in an operation
    for(var j=0; j < workstation_container.childElementCount; j++)
    {
      if(!is_null(workstation_container.childNodes[j].childNodes[0].value) )
      workstation_name_list.push(workstation_container.childNodes[j].childNodes[0].value);
      else
      {
        display_error("Workstation Name cannot be empty"); 
        return false;
      }

    }

    // format operation name
    operation_name = operation_name.toLowerCase();
    operation_name = operation_name.charAt(0).toUpperCase() + operation_name.slice(1);
    container.childNodes[i].childNodes[0].childNodes[1].value = operation_name;  

    operation_list[operation_name] = workstation_name_list;
  }
else 
  {
    display_error("Operation Name cannot be empty"); 
    await clear_unsaved_operations();
    return false;
  }
}

if (!validate_proudction_operations_list(operation_list)) return false;

// Update database

var dbref = db.collection("app").doc(company_id).collection("global").doc("operation_list");
try
{
let res = await dbref.set( operation_list ); 

// Remove workstations from global maintenance_list
var old_workstation_names_list = get_workstation_names_from_operations_obj(gl_current_operations_list);
var new_workstation_names_list = get_workstation_names_from_operations_obj(operation_list);
let removed_workstation_names_list = old_workstation_names_list.filter(x => new_workstation_names_list.indexOf(x) === -1);
await delete_maintenance_plan(removed_workstation_names_list,1);

gl_current_operations_list = operation_list;
display_info("Data saved successfully");
return true;
}
catch(error)
{
  console.log(error);
display_error("Operation failed. Please try again later.");
return false;
}

}

/* Firestore security rules - 

Validation while saving production_operation_list
only updates

Basic Checks-
check-> user.customClaims company != "" && company_id match document path 
check-> user.customClaims for permission to edit create / edit operations
check-> length of keys?
check-> map.diff has no removed keys. tot_keys < 15
*/


////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                   DB Functions for Database Operations - Write Data                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////      


//function to create new serial number in database
async function write_serial_number(serial_number, model)
{
try
{

var dbref = db.collection("app").doc(company_id).collection("process_plan").doc(model);
var process_obj = await dbref.get();    // get process object
process_obj = process_obj.data();       // get data from firestore promise


if (is_null(process_obj) )
{
display_error("Serial number could not be created.");
return false;
}
else
{
process_obj["Basic Info"].serial = serial_number;
process_obj["Basic Info"].update_time = firebase.firestore.FieldValue.serverTimestamp();
process_obj["Basic Info"].pending_op = process_obj["Basic Info"]["op_order"][0];

//added key
process_obj["Basic Info"].created_by = gl_curr_user_details.email;
}

dbref = db.collection("app").doc(company_id).collection("records").doc(serial_number);
var result = await dbref.set(process_obj);
return true;
}

catch(error)
{
display_error("Serial Number record could not be created. Please check if you have sufficient credits remaining & subscription is not expired.");
return false;
}
}

//function to delete serial number in database
async function delete_serial_number(serial_number)
{
  try
  {
    dbref = db.collection("app").doc(company_id).collection("records").doc(serial_number);
    var result = await dbref.delete();
    display_info("Serial Number " + serial_number + " deleted successfully");
    return true;
  }
  catch(error)
  {
  
    display_error("Serial Number " + serial_number + " could not be deleted. Please check if it exists & no information is entered");
    return false;
  }
}

/* Firestore security rules - 

Validation while creating serial number
only write

Basic Checks-
check-> user.customClaims company != "" && company_id match document path 
check-> record["Basic Info"].update_type == "." (same as process_plan_obj from where its copied)
check-> record["Basic Info"].update_time == request.time


Checks with additional reads- 
check-> serial number does not already exist
check-> user.permission for permission to edit create serial_numbers
check-> no affected/changed keys from process_plan_obj except "Basic Info" & "Basic Info".serial, "Basic Info".update_time
check-> credits available     

*/




////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//                                     Functions for Database Operations - Read Data                                  //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////      

//Function to read serial number record from database
async function read_serial_number_record(serial_number)
{
    var dbref = db.collection("app").doc(company_id).collection("records");
    var record = await dbref.doc(serial_number).get();

    if( !record.exists || is_null(record.data()) )
      return false;
  
    else 
      {
        record = record.data();
  
        // make record object with operations in actual order as per op_order. Operation order gets disturebed while storing in database.
        var operation_list = record["Basic Info"].op_order;
        var decoded_record = {};                                     
  
        decoded_record["Basic Info"] = record["Basic Info"];
  
        // now add operation keys
        for(var i=0; i< operation_list.length; i++)
        {
          decoded_record[operation_list[i]] = record[operation_list[i]];
        }
  
        return decoded_record;
      }
}


//Function to read list of parts / models from database
async function read_model_list()   
{
    var dbref = db.collection("app").doc(company_id).collection("global");
    var model_list = await dbref.doc("model_list").get();

    if( !model_list.exists || is_null(model_list.data()) )
    return [];
  
    else 
    {
    model_list = await model_list.data().val;
    return model_list;
    }
}  


//Function to read production operations list
async function read_production_operations_list()
{
    var dbref = db.collection("app").doc(company_id).collection("global");
    var operation_list = (await dbref.doc("operation_list").get());

    if( !operation_list.exists || is_null(operation_list.data()) )
    return [];

    else
    {
      // Sort operation list as per operation name and return
      operation_list = operation_list.data();

      var operation_name_list = Object.keys(operation_list);
      operation_name_list = operation_name_list.sort();
      var sorted_operation_list = {};

      for(var i=0; i< operation_name_list.length; i++)
      {
        sorted_operation_list[operation_name_list[i]] = operation_list[operation_name_list[i]] ;
      }

      return sorted_operation_list;
    }
}

//Function to read qc_plan / process plan
async function read_qc_plan(model_id)
{

var dbref = db.collection("app").doc(company_id).collection("process_plan");
var process_plan = await dbref.doc(model_id).get();

if( !process_plan.exists || is_null(process_plan.data()) )
return {};

else                    // Decode qc_record to qc_plan_object
{

var qc_record = process_plan.data();                         
var operation_list = qc_record["Basic Info"].op_order;

// Convert qc_record to qc_object

var qc_plan_obj = {};   // initialize object

for(var i=0; i< operation_list.length; i++)
{
  if(operation_list[i] != "Basic Info")
  {
    qc_plan_obj[operation_list[i]] = {};
    qc_plan_obj[operation_list[i]].cycle_time = qc_record[operation_list[i]].cycle_time;
    qc_plan_obj[operation_list[i]].param_list = qc_record[operation_list[i]].param_list;
  }
}

return qc_plan_obj;
} 

}

//Function to read maintenance plan of a workstations
async function read_maintenance_plan(workstation_id)
{
  var dbref = db.collection("app").doc(company_id).collection("maintenance_plan");
  var maintenance_plan = await dbref.doc(workstation_id).get();

  if( !maintenance_plan.exists || is_null(maintenance_plan.data()) )
  return {};
  else
  return maintenance_plan.data();
}

//Function to read global maintenance updates list for all workstations
async function read_global_maintenance_updates()
{
  var dbref = db.collection("app").doc(company_id).collection("global").doc("maintenance_list");
  var maintenance_list = await dbref.get();

  if( !maintenance_list.exists || is_null(maintenance_list.data()) )
  return {};
  else
  return maintenance_list.data();
}

//Function to read credits remaining
async function read_credit_balance()
{
    var dbref = db.collection("app").doc(company_id).collection("credit_logs").doc("0");
    var credits = await dbref.get();

    if( !credits.exists || is_null(credits.data()) )
    return "-";
    
    else return credits.data();
}


//Function to read permission of user with given email
async function read_other_user_permsission(email)
{

var dbref = db.collection("app").doc(company_id).collection("users");
var user_permission = await dbref.doc(email).get();

if( !user_permission.exists || is_null(user_permission.data()) ) // return false if cant read or insufficient permissions
return {};

else return user_permission.data();

}


//Function to read current user permissions
async function read_user_permission()
{

var email = gl_curr_user_details.email;
var dbref = db.collection("app").doc(company_id).collection("users").doc(email);
var user_permission = await dbref.get();

if( !user_permission.exists || is_null(user_permission.data()) ) // return false if cant read or insufficient permissions
return {};

else return user_permission.data();

}


//Function to read list of authorized users
async function read_user_list()
{

var dbref = db.collection("app").doc(company_id).collection("global");
var user_list = await dbref.doc("user_list").get();

if( !user_list.exists || is_null(user_list.data().val ) )
return [];

else return user_list.data().val;

}

//Function to read list of notification subscribers
async function read_notification_subscribers_list()
{

  var dbref = db.collection("app").doc(company_id).collection("global");
  var notification_list = await dbref.doc("alert_subscriber_list").get();

  if( !notification_list.exists || is_null(notification_list.data() ) )
  return {};

  else return notification_list.data();

}

async function subscribe_alert_notifications()
{
  var dbref = db.collection("app").doc(company_id).collection("global");

  if(gl_disruption_alerts_is_subscribed == false)
  await dbref.doc("alerts").onSnapshot(async function(alerts_doc) 
  {
    if( !alerts_doc.exists || is_null(alerts_doc.data() ) )
    {
      console.log("empty");
      return (await alert_notification_update([]));
    }
  
    else
    {
      var alerts = alerts_doc.data();
      const disruption_keys = Object.keys(alerts);
      var disruptions_list = [];
      //decode disruption list
      for(var i=0; i<disruption_keys.length; i++)
      {

        disruptions_list.push ({
                                  "id" : disruption_keys[i],
                                  "operation" : alerts[disruption_keys[i]].operation,
                                  "workstation" : alerts[disruption_keys[i]].workstation,
                                  "reason" : alerts[disruption_keys[i]].reason,
                                  "remark" : alerts[disruption_keys[i]].remark,                                  
                                  "start_user" : alerts[disruption_keys[i]].start_user,
                                  "start_time" : new Date(decode_date(alerts[disruption_keys[i]].start_time,1))
                               });
      }

      gl_disruption_alerts_is_subscribed = true; // mark as already subscribed
      console.log(disruptions_list);
      return (await alert_notification_update(disruptions_list));
    }
  
  });
                                                                      

/*
  var obj = 
            {
              low_credit : 1,
              disruptions : [
                {id : "123", operation : "Child Part Assembly", workstation : "Workstation 1",  reason : "No power", start_user : "test@cet.com", start_time : new Date()},

                {id : "121222132asd", operation : "op1", workstation : "ws1",  reason : "Machinery Breakdown", start_user : "avinash.jaiswal@simplexmetalprocessors.com", start_time : new Date()}
                            ]
            };
  await alert_notification_update(obj);
  return obj;
*/
}


async function await_loading(fn , arg1 = "", arg2 = "", arg3="", arg4="")
{
  let result = true;
  await start_loading();

  try
  {
   result =  await fn(arg1, arg2, arg3, arg4);
  }
  catch(e)
  {
    console.log(e);
    display_error("Failed to load request. Please check your internet connection and try again.");
    return false;
  }
  await stop_loading();
  return result;
}



// Functions to run on initialization
navigation_helper("navigation_menu");
reset_sections();

//Click Listeners for Display / Update Serial Number Record
scan_qr_update_serial_btn.onclick = async function() {await popup_scanner(document.getElementById("serial_number_update_section")); }
update_serial_btn.onclick = async function(){await await_loading(get_serial_history,"serial_number_update_section");}
create_serial_btn.onclick =  async function(){ var result = setup_multi_serial_number_create_list(); await await_loading(create_new_serial,result[0],result[1], result[2]); }
delete_create_serial_btn.onclick = async function(){await await_loading(remove_new_serial,document.getElementById("serial_number_delete_section").value) };
reset_create_serial_btn.onclick =  async function(){ if(gl_pending_multi_serial_number_create_list.length>0)
                                                      {
                                                        var serial = gl_pending_multi_serial_number_create_list.pop();
                                                        await await_loading(create_new_serial,serial);
                                                      }
                                                     else
                                                      await reset_create_serial("serial_number_create_section");
                                             }

//Listeners for navigation
navigation_menu_btn.onclick = function(){navigation_helper("navigation_menu"); reset_sections();}
navigation_update_serial_btn.onclick = async function(){await navigation_helper("navigation_update_serial");}

// Dashboard Section Navigation
navigation_dashboard_btn.onclick =  async function(){await initialize_dashboard(); navigation_helper("navigation_dashboard"); }
  
  // back button to return to setting from below sub sections
  back_dashboard_menu_btn.onclick = async function(){await initialize_dashboard(); navigation_helper("navigation_dashboard"); } 
  navigation_realtime_analytics_btn.onclick = async function(){await await_loading(initialize_realtime_analytics_section); navigation_helper("navigation_realtime_analytics");}
  navigation_daily_operation_analytics_btn.onclick = async function(){await await_loading(initialize_daily_operation_analytics_section); navigation_helper("navigation_daily_operation_analytics");}
  navigation_hourly_operation_analytics_btn.onclick = async function(){await await_loading(initialize_hourly_operation_analytics_section); navigation_helper("navigation_hourly_operation_analytics");}
  
  navigation_wip_inventory_analytics_btn.onclick = async function(){await await_loading(initialize_wip_inventory_analytics_section); navigation_helper("navigation_wip_inventory_analytics");}
  navigation_process_disruption_analytics_btn.onclick = async function(){await await_loading(initialize_process_disruption_analytics_section); navigation_helper("navigation_process_disruption_analytics");}
  navigation_maintenance_history_analytics_btn.onclick = async function(){await await_loading(initialize_maintenance_history_analytics_section); navigation_helper("navigation_maintenance_history_analytics");}
  
  navigation_operation_pending_jobs_btn.onclick = async function(){await await_loading(initialize_operation_pending_jobs_section); navigation_helper("navigation_operation_pending_jobs");}
  navigation_deviation_required_jobs_btn.onclick = async function(){await await_loading(initialize_deviation_required_jobs_section); navigation_helper("navigation_deviation_required_jobs");}
  navigation_download_job_records_btn.onclick = async function(){await await_loading(initialize_download_job_records_section); navigation_helper("navigation_download_job_records");}


// Create Serial Section Navigation
navigation_create_serial_btn.onclick = async function(){await await_loading(initialize_create_serial_section); navigation_helper("navigation_create_serial");}


// Report Process Disruption Section Navigation
navigation_process_disruptions_btn.onclick = async function(){await await_loading(initialize_process_disruption_section); navigation_helper("navigation_process_disruption");}


// Maintenance Update Section Navigation
navigation_maintenance_updates_btn.onclick = async function(){await await_loading(initialize_maintenance_updates_section); navigation_helper("navigation_maintenance_updates");}


//Configure Settings Section Navigation
navigation_configure_settings_btn.onclick = async function(){navigation_helper("navigation_configure_settings_section");}
  
  // back button to return to setting from below sub sections
  back_configure_settings_menu_btn.onclick = async function(){navigation_helper("navigation_configure_settings_section");}  
  navigation_configure_production_operations_btn.onclick = async function(){await await_loading(initialize_production_operation_section); navigation_helper("navigation_configure_production_operations");}
  navigation_model_qc_plans_btn.onclick = async function(){await await_loading(initialize_create_qc_plan_section); navigation_helper("navigation_model_qc_plans");}
  navigation_configure_maintenance_schedule_btn.onclick = async function(){await await_loading(initialize_configure_maintenance_plan_section); navigation_helper("navigation_configure_maintenance_schedule");}
  navigation_configure_notifications_btn.onclick = async function(){await await_loading(initialize_configure_notifications_section); navigation_helper("navigation_configure_notifications");}
  navigation_user_permission_btn.onclick = async function(){await await_loading(initialize_user_permission_section); navigation_helper("navigation_user_permission");}

navigation_view_credits_btn.onclick= async function(){ await await_loading(initialize_view_credits_section); navigation_helper("navigation_view_credits");}

//Click Listeners for Create Process Plan for Part / Model
create_model_qc_plan_btn.onclick = async function(){await await_loading(create_qc_plan_screen, "model_id_qc_plan_section"); }
add_stage_qc_plan_btn.onclick = async function(){await add_qc_stage(); }
remove_stage_qc_plan_btn.onclick = async function(){await remove_qc_stage(); }

//Click Listeners for User Permission Section
create_new_user_btn.onclick = async function(){await await_loading(create_new_user, "email_user_permission_section","password_user_permission_section"); }
set_user_permission_btn.onclick = async function(){ await await_loading(create_user_permission_screen, "select_email_user_permission_section"); }


//Click Listeners for Configure Production Operations
add_production_operation_btn.onclick = async function(){await add_production_operation_stage(); }
remove_production_operation_btn.onclick = async function()
{await display_confirmation("Are you sure you want to remove the last operation? You won't be able to monitor it in the dashboard if removed!", remove_production_operation_stage); }
save_production_operation_btn.onclick = async function(){await save_production_operation_list(); }

logout_btn.onclick = async function() {await sign_out_user(); }



// Help Tips for different sections

process_plan_help.onclick = function() { display_help("Each Process Plan is a set of specifications that define a particular product model.<br><br>Example: Suppose you make tables of 3 different sizes. You would have to create a Process Plan for each different table model-<br><br><ul><li>4 seater table</li><li>6 seater table</li><li>8 seater table</li></ul>"); }

process_operation_help.onclick = function() { display_help("Operations are individual stages of a process.<br><br>Example: Suppose you want to make a table. It's process plan could have operations like-<br><br><ul><li>Make 4 table legs</li><li>Make 1 table top</li><li>Assemble table legs and top</li></ul>"); }


// Check if browser is online or offline
window.addEventListener('online', () => dismiss_all_modals());
window.addEventListener('offline', () => display_offline_message());

if(window.navigator.onLine == false) display_offline_message();

function display_offline_message()
{display_info_no_dismiss("<div class='text-center m-3 text-primary'>No internet connection available. Please check your device settings.</div>");}

function get_dummy_records(starting_serial = 0, ending_serial = 15)
{
  var record_array = [];
  for (var i = Number(starting_serial); i<= Number(ending_serial); i++)
  {
    var rand_seed = Math.random();
    rand_seed = Math.round(rand_seed);

    var rand_seed1 = Math.random();
    rand_seed1 = Math.round(rand_seed1);

    var rand_seed2 = Math.random();
    rand_seed2 = Math.round(rand_seed2);

    let record = {

      ["Basic Info"] : {
                    serial: i, 
                    model: (rand_seed2 == 0)?"Model X":"Model Y",
    
    
                    status : 2,                      // 0: completed, 1: minor deviation required before completion, 2: all ok/in progress,  
                                                     // 3: major deviation required, 4: rejected. Value is max value of all sub - statuses in operations
                                                     
                    external_id: i+"EXTL",
    
                    current_op : "Bending",   // possible values - current operation names, blank "" - if all operations done 
                    pending_op : "Punching",  // next operation to be done
                    op_order : ['Bending', 'Punching'],     // array showing order of operations
                    update_type:1,           // indicates what kind of update is done and what parameters to check
                    update_time : new Date(),   // Timestamp when last operation entry / update happened (except for Basic Info changes)

                    log :    {
                                  entry_dt: new Date(),
                                  entry_by: "user1@gmail.com",
                                  update_dt: "",
                                  update_by: ""
                             }
    
                    },
    
      ["Bending"] : 
            {
                    workstation: (rand_seed == 0)?"WS 1":"WS 2",
                    cycle_time : 10,
                    status: (rand_seed == 0)?0:1, // 0: completed, 1: minor deviation required before completion, 2: in progress, 3: major deviation required, 4: rejected       
                    param_list: [
                                  {name:"Param1", type:"Numeric Range", level:"Minor", value1:10, value2:12, link:"https://web.com", method:"visual" },
                                  {name:"Param2", type:"Option List", level:"Major", value1:"Yes", value2:"No,Maybe", link:"https://web.com", method:"visual" },
                                  {name:"Param3", type: data_types[2], level:"Major", value1: "Model A", value2:"", link:"https://web.com", method:"visual" },
                                  {name:"Param4", type: data_types[3], level:"Major", value1:"Test entry", value2:"", link:"https://web.com", method:"visual" }
    
                                ],
    
                      log :    {
                                  entry_dt: (rand_seed1 == 0)?new Date():new Date("5 Nov 20"),
                                  entry_by: "user1@gm.com",
                                  update_dt: new Date(),
                                  update_by: "user1@gm.com",
                                  deviation_dt:  new Date(),
                                  deviation_by: "adm",
                                  remark: "sample remark"
                                },
    
                  actual_value: {
                                  "Param1" : (rand_seed == 0)?10:11,
                                  "Param2" : "Yes",
                                  "Param3" : (rand_seed == 0)?"Model A":"Model B",
                                  "Param4" : "test",
    
                                }
            }, 
    
            ["Punching"] : 
            {
                    workstation: "",
                    cycle_time : 10,
                    status: (rand_seed == 0)?1:3, // 0: completed, 1: minor deviation required before completion, 2: in progress, 3: major deviation required, 4: rejected       
                    param_list: [
                                  {name:"Param1", type:"Numeric Range", level:"Minor", value1:10, value2:12, link:"https://web.com", method:"visual" },
                                  {name:"Param2", type:"Option List", level:"Major", value1:"Yes", value2:"No,Maybe", link:"https://web.com", method:"visual" },
                                  {name:"Param3", type: data_types[2], level:"Major", value1: "Model B", value2:"" , link:"https://web.com", method:"visual"},
                                  {name:"Param4", type: data_types[3], level:"Major", value1:"Test entry", value2:"" , link:"https://web.com", method:"visual"}
    
                                ],
    
                      log :    {
                                  entry_dt: "",
                                  entry_by: "",
                                  update_dt: "",
                                  update_by: "",
                                  deviation_dt: "",
                                  deviation_by: "",
                                  remark: "sample remark"
                                },
    
                  actual_value: {
                                  "Param1" : (rand_seed == 0)?12:11,
                                  "Param2" : (rand_seed == 0)?"Yes":"No",
                                  "Param3" : (rand_seed == 0)?"Model B":"Model A",
                                  "Param4" : "test",
    
                                }
            }                 
    
    
    }
    record_array.push(record);
    
  }
  return record_array;
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Sample objects
/*
//Also includes basic info, log, actual_value, etc. same as record in new version
        var qc_plan = {
                    ["Bending"] : 
                            {
                                    param_list: [
                                                  {name:"Param1", type:"Numeric Range", level:"Minor", value1:10, value2:12, link:"https://web.com", method:"visual" },
                                                  {name:"Param2", type:"Option List", level:"Major", value1:"Yes", value2:"No,Maybe", link:"https://web.com", method:"visual" },
                                                  {name:"Param3", type: data_types[2], level:"Major", value1: gl_model_list[1], value2:"", link:"https://web.com", method:"visual" },
                                                  {name:"Param4", type: data_types[3], level:"Major", value1:"Test entry", value2:"", link:"https://web.com", method:"visual" }

                                                ]
                            },

                     ["Punching"] : 
                            {
                                    param_list: [
                                                  {name:"Param1", type:"Numeric Range", level:"Minor", value1:10, value2:12, link:"https://web.com", method:"visual" },
                                                  {name:"Param2", type:"Option List", level:"Major", value1:"Yes", value2:"No,Maybe", link:"https://web.com", method:"visual" },
                                                  {name:"Param3", type: data_types[2], level:"Major", value1: gl_model_list[1], value2:"", link:"https://web.com", method:"visual" },
                                                  {name:"Param4", type: data_types[3], level:"Major", value1:"Test entry", value2:"", link:"https://web.com", method:"visual" }

                                                ]
                            }                            

                    }


}


disruption_record = {
                        ["reason"] : reason,
                        ["operation"] : operation,
                        ["workstation"] : workstation,
                        ["remark"] : remark,             
                        ["start_user"] : gl_curr_user_details.email,
                        ["start_time"] : firebase.firestore.FieldValue.serverTimestamp(),
                        ["end_time"] : "",
                        ["end_user"] : ""
                    };




maintenance_record = {
                      "type" : maintenance_update_type,
                      "workstation" : workstation_id,
                      "remark" : "Description of maintenance work done goes here",
                      "timestamp" : firebase.firestore.FieldValue.serverTimestamp(),
                      "user" : gl_curr_user_details.email,
                      "param_list" : { "Param1" : 10, "Param2" : "Yes" }
                     };


let record = {

  ["Basic Info"] : {
                serial: "1247", 
                model: "Long Member AS2",


                status : 2,                      // 0: completed, 1: minor deviation required before completion, 2: all ok/in progress,  
                                                 // 3: major deviation required, 4: rejected. Value is max value of all sub - statuses in operations
                                                 
                external_id: "1247ECL",

                current_op : "Bending",   // possible values - current operation names, blank "" - if all operations done 
                pending_op : "Punching",  // next operation to be done
                op_order : ['Bending', 'Punching'],     // array showing order of operations
                update_type:1,           // indicates what kind of update is done and what parameters to check
                update_time : new Date(), // indicates timestamp of last operation stage entry / update / change (except for Basic Info changes)

                log :    {
                              entry_dt: new Date().toISOString(),
                              entry_by: "user1@gmail.com",
                              update_dt: "",
                              update_by: ""
                         }

                },

  ["Bending"] : 
        {
                workstation: "",
                status: 1, // 0: completed, 1: minor deviation required before completion, 2: in progress, 3: major deviation required, 4: rejected       
                param_list: [
                              {name:"Param1", type:"Numeric Range", level:"Minor", value1:10, value2:12, link:"https://web.com", method:"visual" },
                              {name:"Param2", type:"Option List", level:"Major", value1:"Yes", value2:"No,Maybe", link:"https://web.com", method:"visual" },
                              {name:"Param3", type: data_types[2], level:"Major", value1: "Model A", value2:"", link:"https://web.com", method:"visual" },
                              {name:"Param4", type: data_types[3], level:"Major", value1:"Test entry", value2:"", link:"https://web.com", method:"visual" }

                            ],

                  log :    {
                              entry_dt: new Date().toISOString(),
                              entry_by: "user1@gm.com",
                              update_dt: new Date().toISOString(),
                              update_by: "user1@gm.com",
                              deviation_dt:  new Date().toISOString(),
                              deviation_by: "adm",
                              remark: "sample remark"
                            },

              actual_value: {
                              "Param1" : 9,
                              "Param2" : "Yes",
                              "Param3" : 1247,
                              "Param4" : "test",

                            }
        }, 

        ["Punching"] : 
        {
                workstation: "",
                status: 2, // 0: completed, 1: minor deviation required before completion, 2: in progress, 3: major deviation required, 4: rejected       
                param_list: [
                              {name:"Param1", type:"Numeric Range", level:"Minor", value1:10, value2:12, link:"https://web.com", method:"visual" },
                              {name:"Param2", type:"Option List", level:"Major", value1:"Yes", value2:"No,Maybe", link:"https://web.com", method:"visual" },
                              {name:"Param3", type: data_types[2], level:"Major", value1: "Model B", value2:"", link:"https://web.com", method:"visual" },
                              {name:"Param4", type: data_types[3], level:"Major", value1:"Test entry", value2:"", link:"https://web.com", method:"visual" }

                            ],

                  log :    {
                              entry_dt: "",
                              entry_by: "",
                              update_dt: "",
                              update_by: "",
                              deviation_dt: "",
                              deviation_by: "",
                              remark: "sample remark"
                            },

              actual_value: {
                              "Param1" : 11,
                              "Param2" : "Yes",
                              "Param3" : 1247,
                              "Param4" : "test",

                            }
        }                 


}


*/
