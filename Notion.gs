/**
 * Based on https://github.com/JulyFaraway/GAS-Notion-GCal-Todoist-Sync MIT Licence
 */
class NotionDBList {
    /**
     * Used to access the list of Notion databases accessible to the Notion API integration.
     * @constructor
     */
    constructor() {
      this.secret = PropertiesService.getScriptProperties().getProperty('NOTION_API_TOKEN');
      this.databases = this.listDatabases();
    }
  
    listDatabases() {
      try {
        const url = "https://api.notion.com/v1/search";
        const response = UrlFetchApp.fetch(url, {
          method: 'post',
          contentType: 'application/json',
          muteHttpExceptions: true,
          headers: {
            Authorization: `Bearer ${this.secret}`,
            "Notion-Version": NOTION_API_VERSION
          },
          payload: JSON.stringify({
            filter: {
              value: 'database',
              property: 'object'
            }
          })
        });
  
        const { results = [] } = JSON.parse(response.getContentText());
        const databases = results
          .map(({ id, title: [{ plain_text: title }] }) => ({ id, title })) 
          .reduce((obj, db) => {
            obj[db.title] = db.id;
            return obj;
          }, {});
  
        return databases;
      } catch (ex) {
        console.error(`Error fetching databases:\nMessage: ${ex.message}\nFile: ${ex.fileName}\nLine: ${ex.lineNumber}`);
        // Consider re-throwing the error or returning a default value to handle it gracefully in the calling code.
      }
    }
  }
  
  class NotionPayload {
    setParent(databaseId) {
      this.parent = {
        database_id: databaseId
      };
      return this; // Enable chaining for better readability
    }
  
    setProperties(propertiesObject) {
      this.properties = propertiesObject;
      return this; // Enable chaining
    }
  
    setFilter(filterObject) {
      this.filter = filterObject;
      return this; // Enable chaining
    }
  
    setPageSize(pageSize) {
      if (pageSize <= 0) throw new Error('Invalid page size. It must be a positive number.');
      this.page_size = pageSize;
      return this; // Enable chaining
    }
  }
  
  class NotionDatabase {
    /**
     * @constructor
     */
    constructor(database_id) {
      if (!database_id) throw new Error('Database ID must be provided.');
      this.secret = PropertiesService.getScriptProperties().getProperty(NOTION_API_TOKEN_PROPERTY);
      this.headers = this.setApiHeader(this.secret, NOTION_API_VERSION);
      this.databaseId = database_id;
      this.propertyList = this.listProperties();
      this.propertyTypeList = this.listPropertiesTypes();
      this.maxQuerySize = 100;
      this.minQuerySize = 1;
      this.minPageNumber = 0;
    }
  
    /**
     * setApiHeader
     *   Sets the request header.
     *
     * @param {string} secret - The secret to access your internal integration, see https://www.notion.so/my-integrations
     * @param {string} version - Notion-Version
     * @return {object} - fetch header
     */
    setApiHeader(secret, version) {
      return {
        Authorization: `Bearer ${secret}`,
        'Notion-Version': version
      };
    }
  
    listProperties() {
      const firstPage = this.queryPage().shift();
      if (!firstPage) throw new Error("Couldn't query page.");
      return firstPage.properties;
    }
  
    /**
     * listPropertiesTypes
     *   Returns a list of property names and their types in the Notion database.
     *
     * @return {object} properties
     */
    listPropertiesTypes() {
      const firstPage = this.queryPage().shift();
      if (!firstPage) throw new Error("Couldn't query page.");
      const propertyList = Object.assign(...Object.keys(firstPage.properties).map(key => ({ [key]: firstPage.properties[key].type })));
      return propertyList;
    }
  
    /**
     * existsPropertyName
     *   Checks if the target property name exists in the Notion database.
     *
     * @param {string} propName
     * @return {boolean}
     */
    existsPropertyName(propName) {
      return this.properties[propName]; // This might need adjustment depending on how 'properties' is used elsewhere
    }
  
    /**
     * getPage
     *   Returns the Notion Page object with the specified page ID.
     *
     * @param {string} page_id - The target page ID
     * @return {NotionPage Object}
     */
    getPage(page_id) {
      try {
        const url = this.makePagesUrl(page_id);
        const option = this.makeApiOption('GET');
        const response = UrlFetchApp.fetch(url, option);
        return JSON.parse(response.getContentText());
      } catch (ex) {
        console.error(`Error fetching page:\nMessage: ${ex.message}\nFile: ${ex.fileName}\nLine: ${ex.lineNumber}`);
        // Consider re-throwing or returning a default value for graceful error handling
      }
    }
  
    queryPage(filter, pageSize) { 
      try {
        const payload = new NotionPayload();
        if (filter) payload.setFilter(filter);
        if (pageSize > 0) payload.setPageSize(pageSize);
        const url = this.makeQueryUrl(this.databaseId);
        const option = this.makeApiOption('POST', payload);
        const response = UrlFetchApp.fetch(url, option);
        const { results = [] } = JSON.parse(response.getContentText());
        return results;
      } catch (ex) {
        console.error(`Error querying page:\nMessage: ${ex.message}\nFile: ${ex.fileName}\nLine: ${ex.lineNumber}`);
        // Consider re-throwing or returning a default value
      }
    }
  
    /**
     * fetchPage
     *   Returns the latest page with the specified property value.
     *
     * @param {string|number|date|boolean} targetValue - The value to search for
     * @param {string} targetPropName - The name of the property to search in
     * @return {object|undefined} - Returns the page object or undefined if not found
     */
    fetchPage(targetValue, targetPropName) {
      try {
        const targetPropType = this.propertyTypeList[targetPropName];
        const response = this.queryPage(
          NotionFilterSet.propEquals(targetPropName, targetPropType, targetValue),
          this.minQuerySize
        );
        return response[this.minPageNumber];
      } catch (ex) {
        console.error(`Error fetching page:\nMessage: ${ex.message}\nFile: ${ex.fileName}\nLine: ${ex.lineNumber}`);
        // Consider re-throwing or returning a default value
      }
    }
  
    /**
     * createPage
     *   Creates a new page in the Notion database.
     *   See https://developers.notion.com/reference/page#page-property-value
     *
     * @param {Array of NotionPageProp} properties - The properties of the new page
     */
    createPage(properties) {
      try {
        let payload = new NotionPayload();
        payload.setParent(this.databaseId);
        payload.setProperties(properties);
  
        const url = this.makePagesUrl();
        const option = this.makeApiOption('POST', payload);
        const response = UrlFetchApp.fetch(url, option);
        return JSON.parse(response.getContentText());
      } catch (ex) {
        console.error(`Error creating page:\nMessage: ${ex.message}\nFile: ${ex.fileName}\nLine: ${ex.lineNumber}`);
        // Consider re-throwing or returning a default value
      }
    }
  
  /** 
   * Make request Option
   *
   * @param {string} method - The HTTP method (e.g., 'POST', 'GET')
   * @param {object} payload - The request payload (optional)
   */
  makeApiOption(method = 'POST', payload) {
    let option = {
      method: method,
      contentType: 'application/json',  
      muteHttpExceptions: true,
      headers: this.headers
    };
    if (payload) {
      option.payload = JSON.stringify(payload);
    }
    return option;
  }

  makeSearchUrl(pageId = '') {
    return 'https://api.notion.com/v1' + pageId + '/search';
  }

  makeQueryUrl() {
    return 'https://api.notion.com/v1/databases/' + this.databaseId + '/query';
  }

  makePagesUrl(pageId = '') {
    return 'https://api.notion.com/v1' + '/pages/' + pageId;
  }

  /**
   * listUpdatedData
   *   Lists Notion data that has been updated since the last search.
   *   See https://developers.notion.com/reference/database
   *
   * @param {string} databaseName - The name of the Notion database to search for updated data
   * @return {object} updatedLists - A list of pages that have been updated since the last search
   */
  listUpdatedData() {
    const needCreateGCalFilter = NotionFilter.and(
      NotionFilterSet.hasTaskTitle(true),
      NotionFilterSet.hasDeadline(true),
      NotionFilterSet.isdone(false),
      NotionFilterSet.hasGCalEventId(false),
      NotionFilterSet.hasGCalCalendarId(true)
    );

    const needUpdateGCalFilter = NotionFilter.and(
      NotionFilterSet.hasTaskTitle(true),
      NotionFilterSet.hasDeadline(true),
      NotionFilterSet.isdone(false),
      NotionFilterSet.hasGCalEventId(true),
      NotionFilterSet.hasGCalCalendarId(true),
      NotionFilterSet.isLaterUpdatedThanGCal(true)
    );

    const needCancelGCalFilter = NotionFilter.and(
      NotionFilterSet.hasTaskTitle(true),
      NotionFilterSet.hasDeadline(true),
      NotionFilterSet.isdone(true),
      NotionFilterSet.hasGCalEventId(true),
      NotionFilterSet.hasGCalCalendarId(true),
      NotionFilterSet.isLaterUpdatedThanGCal(true)
    );

    const updateDataFilter = NotionFilter.or(needCreateGCalFilter, needUpdateGCalFilter, needCancelGCalFilter); 

    try {
      return this.queryPage(updateDataFilter, this.maxQuerySize);
    } catch (e) {
      let message = "An error occurred, likely due to an incorrect database name. Please check global_variable.gs.";
      message += e;
      console.error(message);
      // It's generally a good practice to re-throw the error or return a meaningful value 
      // to indicate failure to the calling code.
    }
  }

  // TODO
  // Create a list of filters from propertyNames
  // makeFilters(userPropertyNames)
  // Create NotionFilterSet for each Database
  // Property requires a correspondence between name and type
  // If only the name is entered, get the type from property.type
  // Function to check if all Namelist exists in property (if false, throw an error and don't start the update)
}